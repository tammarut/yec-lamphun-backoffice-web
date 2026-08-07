import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "./create-renewal.errors"
import { CreateRenewalService } from "./create-renewal.service"
import type { CreateRenewalRequest } from "./create-renewal.types"

describe("CreateRenewalService", () => {
	let service: CreateRenewalService
	let mockRepo: MockProxy<IMembershipRenewalRepository>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMembershipRenewalRepository>()
		// Happy-path defaults: an ACTIVE member, and a successful renewal insert.
		mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("ACTIVE"))
		mockRepo.createRenewal.mockResolvedValue(ok(71))

		service = new CreateRenewalService(mockRepo)
	})

	const validReq: CreateRenewalRequest = {
		memberId: 15,
		paymentSlip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
	}

	describe("Happy cases", () => {
		test("returns ok(renewalId) for an ACTIVE member", async () => {
			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result._unsafeUnwrap()).toBe(71)
		})

		test("allows an EXPIRED member to file a renewal", async () => {
			// Arrange — EXPIRED is the expected path back to ACTIVE.
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("EXPIRED"))

			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result.isOk()).toBe(true)
		})

		test("calls repository.createRenewal with memberId + paymentSlip", async () => {
			// Act
			await service.execute(validReq)

			// Assert — the repository owns the cross-table transaction (ADR-0014).
			expect(mockRepo.createRenewal).toHaveBeenCalledTimes(1)
			expect(mockRepo.createRenewal).toHaveBeenCalledWith(15, validReq.paymentSlip)
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError when the member does not exist", async () => {
			// Arrange — null status = not found / soft-deleted (indistinguishable).
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(validReq)

			// Assert — the write path is never reached.
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
			expect(mockRepo.createRenewal).not.toHaveBeenCalled()
		})

		test("returns ResignedMemberError when member.status is RESIGNED", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("RESIGNED"))

			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(ResignedMemberError)
			expect(mockRepo.createRenewal).not.toHaveBeenCalled()
		})

		test("returns PendingRenewalExistsError when member.status is PENDING_RENEWAL (pre-check)", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(ok("PENDING_RENEWAL"))

			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(PendingRenewalExistsError)
			expect(mockRepo.createRenewal).not.toHaveBeenCalled()
		})

		test("propagates PendingRenewalExistsError from the repository (23505 race-catch)", async () => {
			// Arrange — the pre-check passed but a concurrent request inserted the
			// renewal first; the unique index rejected this INSERT with pg 23505.
			mockRepo.createRenewal.mockResolvedValue(err(new PendingRenewalExistsError()))

			// Act
			const result = await service.execute(validReq)

			// Assert — same domain fact, same error class as the pre-check path.
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(PendingRenewalExistsError)
		})

		test("propagates DatabaseError when the status read fails", async () => {
			// Arrange
			mockRepo.getMemberStatusForRenewal.mockResolvedValue(err(new DatabaseError("boom")))

			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.createRenewal).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the create transaction fails", async () => {
			// Arrange
			mockRepo.createRenewal.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(validReq)

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})
