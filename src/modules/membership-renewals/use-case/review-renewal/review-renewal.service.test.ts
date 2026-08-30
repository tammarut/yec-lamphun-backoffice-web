import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { RenewalAlreadyReviewedError, RenewalNotFoundError } from "./review-renewal.errors"
import { ReviewRenewalService } from "./review-renewal.service"
import type { ReviewRenewalRequest } from "./review-renewal.types"

describe("ReviewRenewalService", () => {
	let service: ReviewRenewalService
	let mockRepo: MockProxy<IMembershipRenewalRepository>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMembershipRenewalRepository>()
		// Happy-path defaults: a live pending renewal, and a successful apply.
		mockRepo.getRenewalForReview.mockResolvedValue(ok({ id: 79, memberId: 15, status: "PENDING_REVIEW" }))
		mockRepo.applyReview.mockResolvedValue(ok(undefined))

		service = new ReviewRenewalService(mockRepo)
	})

	const baseReq = (overrides: Partial<ReviewRenewalRequest> = {}): ReviewRenewalRequest => ({
		renewalId: 79,
		decision: "APPROVED",
		reason: null,
		...overrides,
	})

	/** The single ReviewedRenewal outcome passed to repo.applyReview, if any. */
	const passedOutcome = () => mockRepo.applyReview.mock.calls[0]?.[0]

	describe("Happy cases", () => {
		test("approve a PENDING_REVIEW renewal -> ok, outcome carries APPROVED / ACTIVE / expiry, no reason", async () => {
			// Act
			const result = await service.execute(baseReq())

			// Assert — the outcome (not the service) computed the approve effects.
			expect(result.isOk()).toBe(true)
			const outcome = passedOutcome()
			expect(outcome?.renewalId).toBe(79)
			expect(outcome?.memberId).toBe(15)
			expect(outcome?.status).toBe("APPROVED")
			expect(outcome?.memberStatus).toBe("ACTIVE")
			expect(outcome?.rejectionReason).toBeNull()
			expect(outcome?.expiresAt).toBeInstanceOf(Date)
		})

		test("reject a PENDING_REVIEW renewal -> ok, outcome carries REJECTED / EXPIRED / reason, no expiry", async () => {
			// Act
			const result = await service.execute(baseReq({ decision: "REJECTED", reason: "สลิปไม่ชัด" }))

			// Assert — reject never touches the membership clock.
			expect(result.isOk()).toBe(true)
			const outcome = passedOutcome()
			expect(outcome?.status).toBe("REJECTED")
			expect(outcome?.memberStatus).toBe("EXPIRED")
			expect(outcome?.rejectionReason).toBe("สลิปไม่ชัด")
			expect(outcome?.expiresAt).toBeUndefined()
		})

		test("success resolves to void (the route answers 204 No Content)", async () => {
			// Act
			const result = await service.execute(baseReq())

			// Assert — no payload: `undefined`, not a renewal id.
			expect(result._unsafeUnwrap()).toBeUndefined()
		})
	})

	describe("Unhappy cases", () => {
		test("returns RenewalNotFoundError when the renewal does not exist", async () => {
			// Arrange — null row = not found / soft-deleted (indistinguishable).
			mockRepo.getRenewalForReview.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(baseReq())

			// Assert — the transition and write are never reached.
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(RenewalNotFoundError)
			expect(mockRepo.applyReview).not.toHaveBeenCalled()
		})

		test("returns RenewalAlreadyReviewedError when the row is already terminal (clean pre-check 409)", async () => {
			// Arrange — an APPROVED row surfaces at the domain transition.
			mockRepo.getRenewalForReview.mockResolvedValue(ok({ id: 79, memberId: 15, status: "APPROVED" }))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(RenewalAlreadyReviewedError)
			expect(mockRepo.applyReview).not.toHaveBeenCalled()
		})

		test("propagates the racy RenewalAlreadyReviewedError from the guarded UPDATE (409 twin)", async () => {
			// Arrange — the pre-check saw PENDING_REVIEW, but a concurrent review
			// won the race: the guarded UPDATE inside applyReview matched zero rows.
			mockRepo.applyReview.mockResolvedValue(err(new RenewalAlreadyReviewedError()))

			// Act
			const result = await service.execute(baseReq())

			// Assert — same domain fact, same 409, different detection point.
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(RenewalAlreadyReviewedError)
		})

		test("propagates DatabaseError when the pre-check read fails", async () => {
			// Arrange
			mockRepo.getRenewalForReview.mockResolvedValue(err(new DatabaseError("boom")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.applyReview).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the review transaction fails", async () => {
			// Arrange
			mockRepo.applyReview.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})
