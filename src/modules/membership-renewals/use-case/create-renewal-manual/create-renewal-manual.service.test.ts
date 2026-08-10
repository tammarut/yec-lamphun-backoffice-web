import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "./create-renewal-manual.errors"
import { CreateManualRenewalService } from "./create-renewal-manual.service"
import type { CreateManualRenewalRequest } from "./create-renewal-manual.types"

describe("CreateManualRenewalService", () => {
	let service: CreateManualRenewalService
	let mockRepo: MockProxy<IMembershipRenewalRepository>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMembershipRenewalRepository>()
		// Happy-path defaults: an ACTIVE member, and a successful manual renewal insert.
		mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("ACTIVE"))
		mockRepo.createManualRenewal.mockResolvedValue(ok(71))

		service = new CreateManualRenewalService(mockRepo)
	})

	const baseReq = (overrides: Partial<CreateManualRenewalRequest> = {}): CreateManualRenewalRequest => ({
		memberId: 15,
		paymentSlip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
		...overrides,
	})

	/** The single MembershipRenewal aggregate passed to repo.createManualRenewal, if any. */
	const passedRenewal = (): MembershipRenewal | undefined => mockRepo.createManualRenewal.mock.calls[0]?.[0]

	describe("Happy cases", () => {
		test("ACTIVE member -> ok(renewalId) with APPROVED / ACTIVE (staff instant approval)", async () => {
			// Act
			const result = await service.execute(baseReq())

			// Assert — staff manual submission: aggregate carries the APPROVED / ACTIVE pair.
			expect(result._unsafeUnwrap()).toBe(71)
			expect(passedRenewal()?.status).toBe("APPROVED")
			expect(passedRenewal()?.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("EXPIRED member -> instant approval (APPROVED / ACTIVE)", async () => {
			// Arrange — EXPIRED is the expected path back to ACTIVE.
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("EXPIRED"))

			// Act + Assert
			const result = await service.execute(baseReq())

			expect(result._unsafeUnwrap()).toBe(71)
			expect(passedRenewal()?.status).toBe("APPROVED")
			expect(passedRenewal()?.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("the aggregate carries a non-null expiresAt (membership clock advances)", async () => {
			// Act
			await service.execute(baseReq())

			// Assert — the manual factory computes expiresAt; the public factory does not.
			expect(passedRenewal()?.expiresAt).toBeInstanceOf(Date)
		})

		test("aggregate stamps paymentDateAt at server-now and carries memberId + paymentSlip", async () => {
			// Act
			await service.execute(baseReq({ memberId: 42 }))

			// Assert — the aggregate is persistence-ready: fields flow through getters.
			const renewal = passedRenewal()
			expect(renewal?.memberId).toBe(42)
			expect(renewal?.paymentSlipFilePath).toBe(baseReq().paymentSlip)
			expect(renewal?.paymentDateAt).toBeInstanceOf(Date)
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError when the member does not exist", async () => {
			// Arrange — null status = not found / soft-deleted (indistinguishable).
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(baseReq())

			// Assert — the write path is never reached.
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
			expect(mockRepo.createManualRenewal).not.toHaveBeenCalled()
		})

		test("returns ResignedMemberError when member.status is RESIGNED", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("RESIGNED"))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(ResignedMemberError)
			expect(mockRepo.createManualRenewal).not.toHaveBeenCalled()
		})

		test("returns PendingRenewalExistsError when member.status is PENDING_RENEWAL (pre-check)", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("PENDING_RENEWAL"))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(PendingRenewalExistsError)
			expect(mockRepo.createManualRenewal).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the status read fails", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(err(new DatabaseError("boom")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.createManualRenewal).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the create transaction fails", async () => {
			// Arrange
			mockRepo.createManualRenewal.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})
