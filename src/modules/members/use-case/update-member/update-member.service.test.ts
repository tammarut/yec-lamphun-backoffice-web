import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { CryptoError, type IBlindIndexService, type IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { MemberDetailReadModel } from "src/modules/members/domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import type { CreateMemberRequest } from "../create-new-member/create-member.types"
import { MemberConflictError, MemberValidationError } from "../create-new-member/create-member.errors"
import { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"
import { UpdateMemberService } from "./update-member.service"

describe("UpdateMemberService", () => {
	let service: UpdateMemberService
	let mockRepo: MockProxy<IMemberRepository>
	let mockEncryption: MockProxy<IEncryptionService>
	let mockBlindIndex: MockProxy<IBlindIndexService>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMemberRepository>()
		mockEncryption = mock<IEncryptionService>()
		mockBlindIndex = mock<IBlindIndexService>()

		// Default: the existing member is found and carries the SAME hash +
		// position as the request, so the conditional checks are skipped on the
		// happy path. The request also sends the same file paths as stored, so
		// no document replacement happens.
		mockRepo.getMemberDetailById.mockResolvedValue(ok(makeReadModel()))
		mockRepo.getPositionByCode.mockResolvedValue(
			ok({
				code: "GENERAL_MEMBER",
				nameTh: "สมาชิกทั่วไป",
				nameEn: "General Member",
				cardinality: "MULTIPLE",
				parentPositionCode: null,
				displayOrder: 900,
				isActive: true,
			})
		)
		mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(0))
		mockRepo.countMemberByIdCardHash.mockResolvedValue(ok(0))
		// Same hash as stored → conditional dup check is skipped on happy path.
		mockBlindIndex.hash.mockReturnValue(ok("stored-hmac-hash"))
		mockEncryption.encrypt.mockReturnValue(ok("enc-base64"))
		mockRepo.update.mockResolvedValue(ok(undefined))

		service = new UpdateMemberService(mockRepo, mockEncryption, mockBlindIndex)
	})

	describe("Happy cases", () => {
		test("returns ok on a valid request with unchanged id_card and position", async () => {
			// Act
			const result = await service.execute(101, makeRequest())

			// Assert — no conditional checks fire (same hash, same position).
			expect(result.isOk()).toBe(true)
			expect(mockRepo.countMemberByIdCardHash).not.toHaveBeenCalled()
			expect(mockRepo.countActiveHolderByPosition).not.toHaveBeenCalled()
			expect(mockRepo.update).toHaveBeenCalledTimes(1)
		})

		test("resolves sticky null file paths to the stored values before update", async () => {
			// Arrange — request sends null for all five sticky file paths.
			const req = makeRequest({
				profileAvatar: null,
				idCardImage: null,
				companyCertificate: null,
				business: { ...makeRequest().business, logo: null, product: null },
			})

			// Act
			const result = await service.execute(101, req)

			// Assert — the service called update with a Member whose sticky paths
			// were substituted from the stored read model, never null.
			expect(result.isOk()).toBe(true)
			const updatedMember = mockRepo.update.mock.calls[0]![1]
			expect(updatedMember.profileAvatar).toBe("members/profile_avatars/a.png")
			expect(updatedMember.business.logoFilePath).toBe("members/business/logo.png")
			expect(updatedMember.business.productFilePath).toBe("members/business/product.png")
			// id_card_image / company_certificate resolve to stored doc paths.
			expect(updatedMember.documents.some((d: { type: string; filePath: string }) => d.type === "ID_CARD")).toBe(true)
			expect(updatedMember.documents.some((d: { type: string; filePath: string }) => d.type === "COMPANY_CERTIFICATE")).toBe(true)
		})

		test("allows changing position to a vacant SINGLE position", async () => {
			// Arrange — request moves the member into PRESIDENT (vacant).
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
			)
			mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(0))

			// Act
			const result = await service.execute(101, makeRequest({ position: "PRESIDENT" }))

			// Assert — position changed → conflict check ran → 0 other holders → ok.
			expect(result.isOk()).toBe(true)
			expect(mockRepo.countActiveHolderByPosition).toHaveBeenCalledWith("PRESIDENT")
		})

		test("preserves lifecycle fields (status, member_since, expires_at, count) on the updated member", async () => {
			// Act
			const result = await service.execute(101, makeRequest())

			// Assert — the aggregate passed to the repository keeps the stored
			// lifecycle fields rather than recomputing them (grilling Q4).
			expect(result.isOk()).toBe(true)
			const updatedMember = mockRepo.update.mock.calls[0]![1]
			expect(updatedMember.status).toBe("EXPIRED") // from makeReadModel, NOT "ACTIVE"
			expect(updatedMember.renewalSuccessfulCount).toBe(3) // from makeReadModel, NOT 0
		})

		test("does not flag a document type for replacement when the path is unchanged", async () => {
			// Arrange — request sends the SAME id_card path as stored.
			const req = makeRequest({ idCardImage: "members/documents/idcard-stored.jpg" })

			// Act
			const result = await service.execute(101, req)

			// Assert — ID_CARD not in the replacement set → empty types list.
			expect(result.isOk()).toBe(true)
			expect(mockRepo.update.mock.calls[0]![2]).toEqual([])
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberNotFoundError when the member does not exist", async () => {
			// Arrange
			mockRepo.getMemberDetailById.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(999, makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberNotFoundError)
		})

		test("returns MemberValidationError when the requested position code is unknown", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(101, makeRequest({ position: "CHANCELLOR" }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns POSITION_OCCUPIED when moving into an already-held SINGLE position", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
			)
			// One active holder exists (the member being edited is NOT counted
			// as a holder of PRESIDENT, since they currently hold GENERAL_MEMBER).
			mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(1))

			// Act
			const result = await service.execute(101, makeRequest({ position: "PRESIDENT" }))

			// Assert
			const error = result._unsafeUnwrapErr() as MemberConflictError
			expect(error).toBeInstanceOf(MemberConflictError)
			expect(error.reason).toBe("POSITION_OCCUPIED")
		})

		test("excludes the member themselves when re-assigning their current SINGLE position", async () => {
			// Arrange — the member currently holds PRESIDENT and is being
			// re-saved with PRESIDENT unchanged. countActiveHolderByPosition
			// returns 1 (themselves); subtracting one yields 0 other holders.
			mockRepo.getMemberDetailById.mockResolvedValue(ok(makeReadModel({ positionCode: "PRESIDENT" })))
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
			)
			// Position unchanged → conflict check is SKIPPED entirely.
			const req = makeRequest({ position: "PRESIDENT" })

			// Act
			const result = await service.execute(101, req)

			// Assert — unchanged position means no conflict check fires.
			expect(result.isOk()).toBe(true)
			expect(mockRepo.countActiveHolderByPosition).not.toHaveBeenCalled()
		})

		test("returns MemberValidationError when id_card_expiry_date is in the past", async () => {
			// Act — past expiry is caught by Member.update's self-invariant.
			const result = await service.execute(101, makeRequest({ idCardExpiryDate: new Date("2020-01-01") }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns MemberValidationError when id_card_no is not 13 digits", async () => {
			// Act
			const result = await service.execute(101, makeRequest({ idCardNo: "123" }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns CryptoError when encryption fails", async () => {
			// Arrange
			mockEncryption.encrypt.mockReturnValue(err(new CryptoError("aes boom")))

			// Act
			const result = await service.execute(101, makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(CryptoError)
		})

		test("returns DUPLICATE_ID_CARD when the changed id_card hash already exists", async () => {
			// Arrange — request sends a NEW id_card → new hash differs from stored.
			mockBlindIndex.hash.mockReturnValue(ok("new-different-hash"))
			mockRepo.countMemberByIdCardHash.mockResolvedValue(ok(1))

			// Act
			const result = await service.execute(101, makeRequest({ idCardNo: "9876543210987" }))

			// Assert — hash changed → dup check fired → 1 match → conflict.
			const error = result._unsafeUnwrapErr() as MemberConflictError
			expect(error).toBeInstanceOf(MemberConflictError)
			expect(error.reason).toBe("DUPLICATE_ID_CARD")
		})

		test("skips the dup check when the id_card hash is unchanged", async () => {
			// Act — default mock: same hash as stored.
			await service.execute(101, makeRequest())

			// Assert — conditional check skipped.
			expect(mockRepo.countMemberByIdCardHash).not.toHaveBeenCalled()
		})

		test("returns DatabaseError when getMemberDetailById fails", async () => {
			// Arrange
			mockRepo.getMemberDetailById.mockResolvedValue(err(new DatabaseError("select failed")))

			// Act
			const result = await service.execute(101, makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})

		test("returns DatabaseError when repository.update fails", async () => {
			// Arrange
			mockRepo.update.mockResolvedValue(err(new DatabaseError("tx failed")))

			// Act
			const result = await service.execute(101, makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
		})
	})
})

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
		status: "EXPIRED", // non-ACTIVE to prove PATCH preserves it
		idCardNoHash: "stored-hmac-hash",
		renewalSuccessfulCount: 3, // non-zero to prove PATCH preserves it
		createdAt: new Date("2024-01-18T16:00:00.000Z"),
		updatedAt: new Date("2024-01-18T16:00:00.000Z"),
		business: {
			id: 14,
			name: "V Foods",
			description: "desc",
			juristicRegistrationNo: "105557026729",
			categoryId: 73,
			address: "Bangkok",
			location: [100.55, 13.72], // stored in [long, lat] order
			coreBusiness: null,
			website: "https://vfoods.co.th",
			logoFilePath: "members/business/logo.png",
			productFilePath: "members/business/product.png",
			createdAt: new Date("2024-01-18T16:00:00.000Z"),
			updatedAt: new Date("2024-01-18T16:00:00.000Z"),
		},
		idCardImagePath: "members/documents/idcard-stored.jpg",
		companyCertificatePath: "members/documents/cert-stored.jpg",
		...overrides,
	}
}

function makeRequest(overrides: Partial<CreateMemberRequest> = {}): CreateMemberRequest {
	return {
		registrationType: "INDIVIDUAL",
		companyCertificate: "members/documents/cert-stored.jpg",
		idCardImage: "members/documents/idcard-stored.jpg",
		profileAvatar: "members/profile_avatars/a.png",
		titleNameTh: "นาย",
		firstNameTh: "ประเสริฐ",
		lastNameTh: "โชคดี",
		titleNameEn: "Mr.",
		firstNameEn: "Prasert",
		lastNameEn: "Chokdee",
		nickname: "prasert",
		gender: "MALE",
		dateOfBirth: new Date("1990-05-15"),
		nationality: "Thai",
		idCardNo: "1234567890123",
		idCardExpiryDate: new Date("2027-08-19"),
		phoneNo: "0872492219",
		email: "prasert.c@example.com",
		lineId: "prasert.line",
		shirtSize: "L",
		position: "GENERAL_MEMBER",
		business: {
			name: "V Foods",
			juristicRegistrationNo: "105557026729",
			categoryId: 73,
			address: "Bangkok",
			location: [13.72, 100.55], // client sends [lat, long]
			description: "desc",
			coreBusiness: null,
			website: "https://vfoods.co.th",
			logo: "members/business/logo.png",
			product: "members/business/product.png",
		},
		...overrides,
	}
}
