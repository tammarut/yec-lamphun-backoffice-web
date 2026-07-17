import { ok, err } from "neverthrow"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import type { IEncryptionService } from "src/modules/shared/crypto"
import { CryptoError } from "src/modules/shared/crypto"
import { StorageError } from "src/modules/shared/storage"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMemberRepository } from "src/modules/members/interfaces"
import type { MemberDetailReadModel } from "src/modules/members/domain/member-read-models"
import type { MemberFileUrls } from "src/modules/members/member-file-url.types"
import { MemberFileUrlService } from "src/modules/members/member-file-url.service"
import { MemberNotFoundError } from "./get-member-by-id.errors"
import { GetMemberByIdService } from "./get-member-by-id.service"

/** A representative live member read model from the repository. */
function makeReadModel(overrides: Partial<MemberDetailReadModel> = {}): MemberDetailReadModel {
	return {
		id: 101,
		registrationType: "INDIVIDUAL",
		titleNameTh: "นาย",
		firstNameTh: "ประเสริฐ",
		lastNameTh: "โชคดี",
		titleNameEn: "Mr.",
		firstNameEn: "Prasert",
		lastNameEn: "Chokdee",
		nickname: "prasert",
		gender: "MALE",
		dateOfBirth: new Date("1990-05-15T00:00:00.000Z"),
		nationality: "Thai",
		// 13-digit plaintext will be injected via the encryption mock.
		idCardNo: "encrypted-ciphertext",
		idCardExpiryDate: new Date("2025-12-31T00:00:00.000Z"),
		memberSince: new Date("2024-01-18T16:00:00.000Z"),
		expiresAt: new Date("2025-01-18T23:59:59.000Z"),
		profileAvatar: "members/profile_avatars/a.png",
		phoneNo: "0872492219",
		email: "prasert.c@example.com",
		lineId: "prasert.line",
		shirtSize: "L",
		positionCode: "GENERAL_MEMBER",
		status: "ACTIVE",
		createdAt: new Date("2024-01-18T16:00:00.000Z"),
		updatedAt: new Date("2024-01-18T16:00:00.000Z"),
		business: {
			id: 14,
			name: "V Foods",
			description: "desc",
			juristicRegistrationNo: "105557026729",
			categoryId: 73,
			address: "Bangkok",
			location: [100.5596, 13.7207],
			coreBusiness: null,
			website: "https://vfoods.co.th",
			logoFilePath: "members/business/logo.png",
			productFilePath: null,
			createdAt: new Date("2025-12-26T16:22:49.216Z"),
			updatedAt: new Date("2025-05-06T00:00:00.000Z"),
		},
		idCardImagePath: "members/documents/id.jpg",
		companyCertificatePath: "members/documents/cert.jpg",
		...overrides,
	}
}

const FULL_URLS: MemberFileUrls = {
	idCardImage: "https://presigned/id.jpg",
	companyCertificate: "https://presigned/cert.jpg",
	profileAvatar: "https://public/a.png",
	logo: "https://public/logo.png",
	product: null,
}

describe("GetMemberByIdService", () => {
	let service: GetMemberByIdService
	let mockRepo: MockProxy<IMemberRepository>
	let mockEncryption: MockProxy<IEncryptionService>
	let mockUrlService: MockProxy<MemberFileUrlService>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		mockEncryption = mock<IEncryptionService>()
		mockUrlService = mock<MemberFileUrlService>()
		// Defaults — individual tests override.
		mockRepo.getMemberDetailById.mockResolvedValue(ok(makeReadModel()))
		mockEncryption.decrypt.mockReturnValue(ok("6320000011483"))
		// URL service returns Result<MemberFileUrls, StorageError> — happy path ok.
		mockUrlService.resolveMemberFileUrls.mockResolvedValue(ok(FULL_URLS))
		service = new GetMemberByIdService(mockRepo, mockEncryption, mockUrlService)
	})

	describe("Happy cases", () => {
		test("returns the assembled member detail with masked id_card and resolved URLs", async () => {
			const result = await service.execute(101)
			expect(result.isOk()).toBe(true)
			const res = result._unsafeUnwrap()
			// Spot-check the decrypt → mask pipeline: plaintext 6320000011483 → 632XXXXXX1483.
			expect(res.id_card_no).toBe("632XXXXXX1483")
			// URLs came from the URL service.
			expect(res.id_card_image).toBe("https://presigned/id.jpg")
			expect(res.company_certificate).toBe("https://presigned/cert.jpg")
			expect(res.profile_avatar).toBe("https://public/a.png")
			expect(res.business.logo).toBe("https://public/logo.png")
			expect(res.business.product).toBeNull()
			// position ships the raw code, not a display name.
			expect(res.position).toBe("GENERAL_MEMBER")
			// Dates serialize as ISO strings.
			expect(res.date_of_birth).toBe("1990-05-15")
			expect(res.member_since).toBe("2024-01-18T16:00:00.000Z")
			// location is swapped back to API order [lat, long] (the read-model/DB
			// stores [long, lat]; round-trip symmetry with the create request body).
			expect(res.business.location).toEqual([13.7207, 100.5596])
			expect(mockRepo.getMemberDetailById).toHaveBeenCalledWith(101)
		})

		test("the URL service receives all five paths, even null ones", async () => {
			await service.execute(1)
			expect(mockUrlService.resolveMemberFileUrls).toHaveBeenCalledWith({
				idCardImage: "members/documents/id.jpg",
				companyCertificate: "members/documents/cert.jpg",
				profileAvatar: "members/profile_avatars/a.png",
				logo: "members/business/logo.png",
				product: null,
			})
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError when the member does not exist (repo returns null)", async () => {
			mockRepo.getMemberDetailById.mockResolvedValue(ok(null))
			const result = await service.execute(999999)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
		})

		test("propagates DatabaseError from the repository (e.g. query failure → 500)", async () => {
			mockRepo.getMemberDetailById.mockResolvedValue(err(new DatabaseError("query failed")))
			const result = await service.execute(101)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})

		test("returns DatabaseError when a live member has no business row (corruption → 500)", async () => {
			// Defensive guard: even though the repo returns DatabaseError for this case,
			// the service also guards a null business to keep the 500 semantics robust.
			mockRepo.getMemberDetailById.mockResolvedValue(ok(makeReadModel({ business: null })))
			const result = await service.execute(101)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			// Should NOT have called the URL service or tried to shape a response.
			expect(mockUrlService.resolveMemberFileUrls).not.toHaveBeenCalled()
		})

		test("decrypt failure degrades id_card_no to null (request stays ok, 200)", async () => {
			mockEncryption.decrypt.mockReturnValue(err(new CryptoError("bad key")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const result = await service.execute(101)
			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap().id_card_no).toBeNull()
			consoleSpy.mockRestore()
		})

		test("a presign failure propagates as err (infra failure → 500, NOT degraded to null)", async () => {
			// Contrast with the decrypt test above: decrypt is data-level/per-row →
			// degrade to null + 200. Presign is infra-level/systemic → propagate → 500.
			// A 200-with-null-URLs would silently lie that the member has no documents.
			mockUrlService.resolveMemberFileUrls.mockResolvedValue(err(new StorageError("R2 unreachable")))
			const result = await service.execute(101)
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(StorageError)
		})
	})
})
