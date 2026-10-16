import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import type { IIdGenerator } from "src/modules/shared/id-generator"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository, MemberStatusRow } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "./create-renewal-manual.errors"
import { CreateManualRenewalService } from "./create-renewal-manual.service"
import type { CreateManualRenewalRequest } from "./create-renewal-manual.types"

const MINTED_GROUP_ID = "01900000-0000-7000-8000-000000000001"

describe("CreateManualRenewalService", () => {
	let service: CreateManualRenewalService
	let mockRepo: MockProxy<IMembershipRenewalRepository>
	let mockIdGen: MockProxy<IIdGenerator>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMembershipRenewalRepository>()
		mockIdGen = mock<IIdGenerator>()
		// Happy-path defaults: an ACTIVE member, and a successful manual renewal insert.
		mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([{ id: 15, status: "ACTIVE" }]))
		mockRepo.createManualRenewals.mockResolvedValue(ok([{ memberId: 15, renewalId: 71 }]))
		mockIdGen.generate.mockReturnValue(MINTED_GROUP_ID)

		service = new CreateManualRenewalService(mockRepo, mockIdGen)
	})

	const baseReq = (overrides: Partial<CreateManualRenewalRequest> = {}): CreateManualRenewalRequest => ({
		memberIds: [15],
		paymentSlip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
		...overrides,
	})

	/** The aggregates passed to repo.createManualRenewals, if any. */
	const passedRenewals = (): readonly MembershipRenewal[] => mockRepo.createManualRenewals.mock.calls[0]?.[0] ?? []

	/** Build a batched status-read row list. */
	const statuses = (...pairs: Array<[number, string]>): MemberStatusRow[] => pairs.map(([id, status]) => ({ id, status }))

	describe("Happy cases", () => {
		test("solo ACTIVE member -> ok(renewals) with APPROVED / ACTIVE (staff instant approval), no marker minted", async () => {
			// Act
			const result = await service.execute(baseReq())

			// Assert — staff manual submission: aggregates carry APPROVED / ACTIVE;
			// a solo submission stamps NULL (no IIdGenerator call, ADR-0026).
			expect(result._unsafeUnwrap()).toEqual({ renewals: [{ memberId: 15, renewalId: 71 }], groupId: null })
			expect(passedRenewals()[0]?.status).toBe("APPROVED")
			expect(passedRenewals()[0]?.memberStatusOnRenewal).toBe("ACTIVE")
			expect(passedRenewals()[0]?.groupId).toBeNull()
			expect(mockIdGen.generate).not.toHaveBeenCalled()
			expect(mockRepo.getMemberStatusesForRenewal).toHaveBeenCalledTimes(1)
			expect(mockRepo.getMemberStatusesForRenewal).toHaveBeenCalledWith([15])
		})

		test("solo EXPIRED member -> instant approval (APPROVED / ACTIVE)", async () => {
			// Arrange — EXPIRED is the expected path back to ACTIVE.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "EXPIRED"])))

			// Act + Assert
			const result = await service.execute(baseReq())

			expect(result._unsafeUnwrap().renewals).toEqual([{ memberId: 15, renewalId: 71 }])
			expect(passedRenewals()[0]?.status).toBe("APPROVED")
			expect(passedRenewals()[0]?.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("every aggregate carries a non-null expiresAt (membership clock advances)", async () => {
			// Act
			await service.execute(baseReq())

			// Assert — the manual factory computes expiresAt; the public factory does not.
			expect(passedRenewals()[0]?.expiresAt).toBeInstanceOf(Date)
		})

		test("aggregates stamp paymentDateAt at ONE shared server-now and carry memberId + paymentSlip", async () => {
			// Arrange — both members eligible.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "ACTIVE"], [16, "ACTIVE"])))
			mockRepo.createManualRenewals.mockResolvedValue(
				ok([
					{ memberId: 15, renewalId: 81 },
					{ memberId: 16, renewalId: 82 },
				])
			)

			// Act
			await service.execute(baseReq({ memberIds: [15, 16] }))

			// Assert — every aggregate of the submission shares the slip, and the
			// payment date is stamped once (same Date instance), server-side.
			const renewals = passedRenewals()
			expect(renewals.map((renewal) => renewal.memberId)).toEqual([15, 16])
			expect(renewals.every((renewal) => renewal.paymentSlipFilePath === baseReq().paymentSlip)).toBe(true)
			expect(renewals[0]?.paymentDateAt).toBeInstanceOf(Date)
			expect(renewals[1]?.paymentDateAt).toBe(renewals[0]?.paymentDateAt)
		})

		test("3-member group (fan-out live, #85): mints ONE marker shared by every aggregate, rows in request order", async () => {
			// Arrange — all three eligible.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "ACTIVE"], [16, "EXPIRED"], [17, "ACTIVE"])))
			mockRepo.createManualRenewals.mockResolvedValue(
				ok([
					{ memberId: 15, renewalId: 81 },
					{ memberId: 16, renewalId: 82 },
					{ memberId: 17, renewalId: 83 },
				])
			)

			// Act
			const result = await service.execute(baseReq({ memberIds: [15, 16, 17] }))

			// Assert — one mint, every aggregate carries it, one shared clock write
			// base (same expiresAt instant — every member advances off the same now).
			expect(mockIdGen.generate).toHaveBeenCalledTimes(1)
			const renewals = passedRenewals()
			expect(renewals.map((renewal) => renewal.memberId)).toEqual([15, 16, 17])
			expect(renewals.every((renewal) => renewal.groupId === MINTED_GROUP_ID)).toBe(true)
			expect(renewals.every((renewal) => renewal.status === "APPROVED" && renewal.memberStatusOnRenewal === "ACTIVE")).toBe(true)
			expect(new Set(renewals.map((renewal) => renewal.expiresAt?.getTime())).size).toBe(1)
			expect(result._unsafeUnwrap()).toEqual({
				renewals: [
					{ memberId: 15, renewalId: 81 },
					{ memberId: 16, renewalId: 82 },
					{ memberId: 17, renewalId: 83 },
				],
				groupId: MINTED_GROUP_ID,
			})
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError naming the member when it does not exist", async () => {
			// Arrange — a missing id simply comes back absent from the batched read.
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok([]))

			// Act
			const result = await service.execute(baseReq())

			// Assert — the write path is never reached; message names the member.
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
			expect(result._unsafeUnwrapErr().message).toBe("member_id 15 not found")
			expect(mockRepo.createManualRenewals).not.toHaveBeenCalled()
		})

		test("returns ResignedMemberError naming the member when status is RESIGNED", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "RESIGNED"])))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(ResignedMemberError)
			expect(result._unsafeUnwrapErr().message).toBe("member_id 15 is resigned — resigned members cannot submit renewal requests")
			expect(mockRepo.createManualRenewals).not.toHaveBeenCalled()
		})

		test("returns PendingRenewalExistsError naming the member when status is PENDING_RENEWAL (pre-check)", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "PENDING_RENEWAL"])))

			// Act
			const result = await service.execute(baseReq())

			// Assert — this pre-check is ALSO the manual path's only 409: the manual
			// INSERT is status='APPROVED', excluded from the partial unique index, so
			// no 23505 race exists on this flow (unlike the public path).
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(PendingRenewalExistsError)
			expect(result._unsafeUnwrapErr().message).toBe("member_id 15 already has a pending renewal request")
			expect(mockRepo.createManualRenewals).not.toHaveBeenCalled()
		})

		test("aborts on the FIRST offender in REQUEST order (not severity order)", async () => {
			// Arrange — 16 is missing (404), 15 is resigned (403); 16 is first in the
			// request, so 16 is named even though 15's offense is "less severe".
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(ok(statuses([15, "RESIGNED"])))

			// Act
			const result = await service.execute(baseReq({ memberIds: [16, 15] }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
			expect(result._unsafeUnwrapErr().message).toBe("member_id 16 not found")
		})

		test("propagates DatabaseError when the batched status read fails", async () => {
			// Arrange
			mockRepo.getMemberStatusesForRenewal.mockResolvedValue(err(new DatabaseError("boom")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.createManualRenewals).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError when the create transaction fails", async () => {
			// Arrange
			mockRepo.createManualRenewals.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(baseReq())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})
