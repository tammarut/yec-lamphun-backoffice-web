import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IIdGenerator } from "src/modules/shared/id-generator"
import type { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "./create-renewal.errors"
import { CreateRenewalService } from "./create-renewal.service"
import type { CreateRenewalRequest } from "./create-renewal.types"

const MINTED_GROUP_ID = "01913c6e-8b7a-7def-8f2a-3f5c9d8e7f6a"

describe("CreateRenewalService", () => {
	let service: CreateRenewalService
	let mockRepo: MockProxy<IMembershipRenewalRepository>
	let mockIdGen: MockProxy<IIdGenerator>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMembershipRenewalRepository>()
		mockIdGen = mock<IIdGenerator>()
		// Happy-path defaults: an ACTIVE member, a successful renewal insert, and
		// a mintable group id — solo submissions must NOT touch the generator
		// (NULL = solo, ADR-0026), so every solo TC asserts it stayed silent.
		mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "ACTIVE" }]))
		mockRepo.createRenewals.mockResolvedValue(ok([{ memberId: 15, renewalId: 71 }]))
		mockIdGen.generate.mockReturnValue(MINTED_GROUP_ID)

		service = new CreateRenewalService(mockRepo, mockIdGen)
	})

	const baseReq = (overrides: Partial<CreateRenewalRequest> = {}): CreateRenewalRequest => ({
		memberIds: [15],
		paymentSlip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
		isAdmin: false,
		...overrides,
	})

	/** The aggregate array passed to repo.createRenewals, if any. */
	const passedRenewals = (): readonly MembershipRenewal[] | undefined => mockRepo.createRenewals.mock.calls[0]?.[0]

	describe("Happy cases", () => {
		test("PUBLIC: ACTIVE member -> ok(renewals + null groupId) with PENDING_REVIEW / PENDING_RENEWAL", async () => {
			// Act
			const result = await service.execute(baseReq({ isAdmin: false }))

			// Assert — the service built an aggregate carrying the PUBLIC status pair.
			expect(result._unsafeUnwrap()).toEqual({ renewals: [{ memberId: 15, renewalId: 71 }], groupId: null })
			expect(passedRenewals()?.[0]?.status).toBe("PENDING_REVIEW")
			expect(passedRenewals()?.[0]?.memberStatusOnRenewal).toBe("PENDING_RENEWAL")
		})

		test("PUBLIC: EXPIRED member can file a renewal", async () => {
			// Arrange — EXPIRED is the expected path back to ACTIVE.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "EXPIRED" }]))

			// Act
			const result = await service.execute(baseReq({ isAdmin: false }))

			// Assert
			expect(result.isOk()).toBe(true)
		})

		test("ADMIN: ACTIVE member -> APPROVED / ACTIVE (instant approval)", async () => {
			// Act
			const result = await service.execute(baseReq({ isAdmin: true }))

			// Assert — admin bypass: aggregate carries the APPROVED / ACTIVE pair.
			expect(result._unsafeUnwrap()).toEqual({ renewals: [{ memberId: 15, renewalId: 71 }], groupId: null })
			expect(passedRenewals()?.[0]?.status).toBe("APPROVED")
			expect(passedRenewals()?.[0]?.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("solo submission mints NO group marker (NULL = solo) and reads statuses in ONE batched call", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 42, status: "ACTIVE" }]))
			mockRepo.createRenewals.mockResolvedValue(ok([{ memberId: 42, renewalId: 71 }]))

			// Act
			await service.execute(baseReq({ memberIds: [42], isAdmin: false }))

			// Assert
			expect(mockIdGen.generate).not.toHaveBeenCalled()
			expect(passedRenewals()?.[0]?.groupId).toBeNull()
			expect(mockRepo.getMemberStatusesForRenewal).toHaveBeenCalledTimes(1)
			expect(mockRepo.getMemberStatusesForRenewal).toHaveBeenCalledWith([42])
		})

		test("aggregate stamps paymentDateAt at server-now and carries memberId + paymentSlip", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 42, status: "ACTIVE" }]))

			// Act
			await service.execute(baseReq({ memberIds: [42], isAdmin: false }))

			// Assert — the aggregate is persistence-ready: fields flow through getters.
			const renewal = passedRenewals()?.[0]
			expect(renewal?.memberId).toBe(42)
			expect(renewal?.paymentSlipFilePath).toBe(baseReq().paymentSlip)
			expect(renewal?.paymentDateAt).toBeInstanceOf(Date)
		})

		test("N>1 submission (machinery online, ADR-0026): mints ONE group id shared by every aggregate", async () => {
			// Arrange — three eligible members.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(
				ok([
					{ id: 15, status: "ACTIVE" },
					{ id: 16, status: "ACTIVE" },
					{ id: 17, status: "ACTIVE" },
				])
			)
			mockRepo.createRenewals.mockResolvedValue(
				ok([
					{ memberId: 15, renewalId: 71 },
					{ memberId: 16, renewalId: 72 },
					{ memberId: 17, renewalId: 73 },
				])
			)

			// Act
			const result = await service.execute(baseReq({ memberIds: [15, 16, 17] }))

			// Assert — one mint, one shared marker, one aggregate per member.
			expect(mockIdGen.generate).toHaveBeenCalledTimes(1)
			expect(result._unsafeUnwrap()).toEqual({
				renewals: [
					{ memberId: 15, renewalId: 71 },
					{ memberId: 16, renewalId: 72 },
					{ memberId: 17, renewalId: 73 },
				],
				groupId: MINTED_GROUP_ID,
			})
			const renewals = passedRenewals()
			expect(renewals?.map((renewal) => renewal.memberId)).toEqual([15, 16, 17])
			expect(renewals?.every((renewal) => renewal.groupId === MINTED_GROUP_ID)).toBe(true)
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError naming the member when it does not exist", async () => {
			// Arrange — absent from the batched read = not found / soft-deleted.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([]))

			// Act
			const result = await service.execute(baseReq())

			// Assert — the write path is never reached; the member is named.
			expect(result.isErr()).toBe(true)
			const error = result._unsafeUnwrapErr()
			expect(error).toBeInstanceOf(MemberNotFoundError)
			expect(error.message).toBe("member_id 15 not found")
			expect(mockRepo.createRenewals).not.toHaveBeenCalled()
		})

		test("returns ResignedMemberError naming the member when status is RESIGNED", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "RESIGNED" }]))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			const error = result._unsafeUnwrapErr()
			expect(error).toBeInstanceOf(ResignedMemberError)
			expect(error.message).toContain("member_id 15")
			expect(mockRepo.createRenewals).not.toHaveBeenCalled()
		})

		test("returns PendingRenewalExistsError naming the member when status is PENDING_RENEWAL (pre-check)", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "PENDING_RENEWAL" }]))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			const error = result._unsafeUnwrapErr()
			expect(error).toBeInstanceOf(PendingRenewalExistsError)
			expect(error.message).toContain("member_id 15")
			expect(mockRepo.createRenewals).not.toHaveBeenCalled()
		})

		test("aborts on the FIRST offender in REQUEST order (not severity order)", async () => {
			// Arrange — member 16 (asked first) is missing; member 15 is resigned.
			// The 404 for member 16 must win because it comes first in the request.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "RESIGNED" }]))

			// Act
			const result = await service.execute(baseReq({ memberIds: [16, 15] }))

			// Assert
			const error = result._unsafeUnwrapErr()
			expect(error).toBeInstanceOf(MemberNotFoundError)
			expect(error.message).toBe("member_id 16 not found")
		})

		test("propagates PendingRenewalExistsError from the repository (23505 race-catch, public path)", async () => {
			// Arrange — the pre-check passed but a concurrent request inserted the
			// renewal first; the unique index rejected this INSERT with pg 23505.
			mockRepo.createRenewals.mockResolvedValue(err(new PendingRenewalExistsError("member_id 15 already has a pending renewal request")))

			// Act
			const result = await service.execute(baseReq({ isAdmin: false }))

			// Assert — same domain fact, same error class as the pre-check path.
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(PendingRenewalExistsError)
		})

		test("propagates DatabaseError when the batched status read fails", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(err(new DatabaseError("boom")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.createRenewals).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the create transaction fails", async () => {
			// Arrange
			mockRepo.createRenewals.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})
