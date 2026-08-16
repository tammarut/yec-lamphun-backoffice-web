import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { StorageError } from "src/modules/shared/storage"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { MemberLatestRenewalReadModel } from "src/modules/members/domain/member-read-models"
import type { IMemberRepository } from "src/modules/members/interfaces"
import { MemberFileUrlService } from "src/modules/members/member-file-url.service"
import { MemberOrRenewalNotFoundError, RenewalNotFoundError } from "./get-latest-renewal-by-member-id.errors"
import { GetLatestRenewalByMemberIdService } from "./get-latest-renewal-by-member-id.service"

/** A representative member + latest-renewal read model from the repository. */
function makeReadModel(overrides: Partial<MemberLatestRenewalReadModel> = {}): MemberLatestRenewalReadModel {
	return {
		id: 38,
		profileAvatar: "members/profile_avatars/a.png",
		titleNameTh: "นาย",
		firstNameTh: "ก้องภพ",
		lastNameTh: "จบไว",
		nickname: "ก้อง",
		phoneNo: "0982738293",
		positionCode: "GENERAL_MEMBER",
		businessName: "บริษัท วี ฟู้ดส์",
		renewalId: 59,
		renewalPaymentDateAt: new Date("2025-08-23T10:30:00.000Z"),
		renewalPaymentSlipFilePath: "members/documents/payment_slip.png",
		...overrides,
	}
}

describe("GetLatestRenewalByMemberIdService", () => {
	let service: GetLatestRenewalByMemberIdService
	let mockRepo: MockProxy<IMemberRepository>
	let mockUrlService: MockProxy<MemberFileUrlService>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		mockUrlService = mock<MemberFileUrlService>()
		// Defaults — individual tests override.
		mockRepo.getLatestRenewalByMemberId.mockResolvedValue(ok(makeReadModel()))
		mockUrlService.resolveProfileAvatarUrl.mockReturnValue("https://public/a.png")
		mockUrlService.resolvePaymentSlipUrl.mockResolvedValue(ok("https://presigned/slip.png"))
		service = new GetLatestRenewalByMemberIdService(mockRepo, mockUrlService)
	})

	describe("Happy cases", () => {
		test("returns the assembled view with resolved URLs, raw position code, and ISO datetime", async () => {
			const result = await service.execute(38)
			expect(result.isOk()).toBe(true)
			const res = result._unsafeUnwrap()
			expect(res.id).toBe(38)
			expect(res.profile_avatar).toBe("https://public/a.png")
			// position ships the raw code, not a display name.
			expect(res.position).toBe("GENERAL_MEMBER")
			expect(res.business.name).toBe("บริษัท วี ฟู้ดส์")
			expect(res.renewal.id).toBe(59)
			// TIMESTAMPTZ → full ISO datetime (Q6), not date-only.
			expect(res.renewal.payment_date_at).toBe("2025-08-23T10:30:00.000Z")
			expect(res.renewal.payment_slip).toBe("https://presigned/slip.png")
			expect(mockRepo.getLatestRenewalByMemberId).toHaveBeenCalledWith(38)
		})

		test("routes the avatar to the public resolver and the slip to the presign resolver", async () => {
			await service.execute(38)
			expect(mockUrlService.resolveProfileAvatarUrl).toHaveBeenCalledWith("members/profile_avatars/a.png")
			expect(mockUrlService.resolvePaymentSlipUrl).toHaveBeenCalledWith("members/documents/payment_slip.png")
		})

		test("profile_avatar is null when the member has no avatar", async () => {
			mockRepo.getLatestRenewalByMemberId.mockResolvedValue(ok(makeReadModel({ profileAvatar: null })))
			mockUrlService.resolveProfileAvatarUrl.mockReturnValue(null)
			const res = (await service.execute(38))._unsafeUnwrap()
			expect(res.profile_avatar).toBeNull()
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberOrRenewalNotFoundError when the member is not found (repo returns null)", async () => {
			mockRepo.getLatestRenewalByMemberId.mockResolvedValue(ok(null))
			const result = await service.execute(999999)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberOrRenewalNotFoundError)
			// Must short-circuit before touching the URL service.
			expect(mockUrlService.resolvePaymentSlipUrl).not.toHaveBeenCalled()
		})

		test("returns RenewalNotFoundError when the member exists but has no renewal", async () => {
			// The LEFT LATERAL yields NULL renewal columns together.
			mockRepo.getLatestRenewalByMemberId.mockResolvedValue(ok(makeReadModel({ renewalId: null, renewalPaymentDateAt: null, renewalPaymentSlipFilePath: null })))
			const result = await service.execute(38)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(RenewalNotFoundError)
			expect(mockUrlService.resolvePaymentSlipUrl).not.toHaveBeenCalled()
		})

		test("propagates DatabaseError from the repository (query failure → 500)", async () => {
			mockRepo.getLatestRenewalByMemberId.mockResolvedValue(err(new DatabaseError("query failed")))
			const result = await service.execute(38)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})

		test("a presign failure propagates as err(StorageError) (infra failure → 500, NOT degraded to null)", async () => {
			// Contrast with the data-level decrypt-degrades-to-null policy: presign is
			// infra-level/systemic → propagate → 500. A 200-with-null-slip would lie.
			mockUrlService.resolvePaymentSlipUrl.mockResolvedValue(err(new StorageError("R2 unreachable")))
			const result = await service.execute(38)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(StorageError)
		})
	})
})
