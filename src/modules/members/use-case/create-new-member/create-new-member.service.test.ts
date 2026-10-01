import { SQL } from "bun"
import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { CryptoError, type IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IBusinessesRepository } from "../../repository/businesses/interfaces"
import type { IMemberDocumentsRepository } from "../../repository/member-document/interfaces"
import type { IMemberRepository } from "../../interfaces"
import { MemberConflictError, MemberValidationError } from "./create-member.errors"
import type { CreateMemberRequest } from "./create-member.types"
import { CreateNewMemberService } from "./create-new-member.service"

describe("CreateNewMemberService", () => {
	let service: CreateNewMemberService
	let mockRepo: MockProxy<IMemberRepository>
	let mockBusinessRepo: MockProxy<IBusinessesRepository>
	let mockDocsRepo: MockProxy<IMemberDocumentsRepository>
	let mockDbClient: MockProxy<DatabaseClient>
	let mockEncryption: MockProxy<IEncryptionService>
	let mockBlindIndex: MockProxy<IBlindIndexService>
	const fakeTx = Symbol("tx") as unknown as SQL

	beforeEach(() => {
		// Arrange (shared setup) — the service owns the create transaction
		// (ADR-0024); the mock tx handle flows through every repository step.
		mockRepo = mock<IMemberRepository>()
		mockBusinessRepo = mock<IBusinessesRepository>()
		mockDocsRepo = mock<IMemberDocumentsRepository>()
		mockDbClient = mock<DatabaseClient>()
		mockEncryption = mock<IEncryptionService>()
		mockBlindIndex = mock<IBlindIndexService>()

		mockDbClient.transaction.mockImplementation(async (callback) => {
			return await callback(fakeTx)
		})
		mockEncryption.encrypt.mockReturnValue(ok("enc-base64"))
		mockBlindIndex.hash.mockReturnValue(ok("hash-hex"))
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
		mockRepo.countMemberByIdCardHash.mockResolvedValue(ok(0))
		mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(0))
		mockRepo.findLiveContactConflicts.mockResolvedValue(ok({ phoneNo: false, email: false, lineId: false }))
		mockBusinessRepo.existsLiveBusiness.mockResolvedValue(ok(true))
		mockBusinessRepo.lockLiveBusinessById.mockResolvedValue(42)
		mockBusinessRepo.findLiveJuristicConflict.mockResolvedValue(ok(null))
		mockBusinessRepo.insertBusiness.mockResolvedValue(7)
		mockRepo.insertMember.mockResolvedValue(102)

		service = new CreateNewMemberService(mockDbClient, mockRepo, mockBusinessRepo, mockDocsRepo, mockEncryption, mockBlindIndex)
	})

	describe("Happy cases", () => {
		test("returns ok(memberId) on a valid request", async () => {
			// Act
			const result = await service.execute(makeRequest())

			// Assert
			expect(result._unsafeUnwrap()).toBe(102)
		})

		test("persists business → member(linked) → documents inside one transaction", async () => {
			// Act
			await service.execute(makeRequest())

			// Assert — ADR-0024 step order: business first (id feeds the link),
			// member with that id, then one document row per provided document.
			expect(mockBusinessRepo.insertBusiness).toHaveBeenCalledTimes(1)
			expect(mockRepo.insertMember).toHaveBeenCalledTimes(1)
			expect(mockRepo.insertMember).toHaveBeenCalledWith(fakeTx, expect.objectContaining({}), 7)
			// makeRequest provides id_card_image + company_certificate → 2 docs.
			expect(mockDocsRepo.insertDocument).toHaveBeenCalledTimes(2)
		})

		test("allows MULTIPLE position even when holders already exist", async () => {
			// Arrange
			mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(5))

			// Act
			const result = await service.execute(makeRequest({ position: "GENERAL_MEMBER" }))

			// Assert
			expect(result.isOk()).toBe(true)
		})

		test("allows a vacant SINGLE position", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
			)

			// Act
			const result = await service.execute(makeRequest({ position: "PRESIDENT" }))

			// Assert
			expect(result.isOk()).toBe(true)
		})
	})

	describe("business intent (#62 D2/D5, #69)", () => {
		describe("Happy cases", () => {
			test("link branch: attaches the member to the EXISTING live business without inserting a business row", async () => {
				// Arrange
				const linkReq = makeRequest({ business: { kind: "link", businessId: 42 } })

				// Act
				const result = await service.execute(linkReq)

				// Assert — the target is locked + re-checked inside the tx, then its
				// id flows straight into the member insert; no businesses-row write,
				// no juristic check.
				expect(result._unsafeUnwrap()).toBe(102)
				expect(mockBusinessRepo.existsLiveBusiness).toHaveBeenCalledWith(42)
				expect(mockBusinessRepo.lockLiveBusinessById).toHaveBeenCalledWith(fakeTx, 42)
				expect(mockBusinessRepo.findLiveJuristicConflict).not.toHaveBeenCalled()
				expect(mockBusinessRepo.insertBusiness).not.toHaveBeenCalled()
				expect(mockRepo.insertMember).toHaveBeenCalledWith(fakeTx, expect.objectContaining({ positionCode: "GENERAL_MEMBER" }), 42)
				expect(mockDocsRepo.insertDocument).toHaveBeenCalledTimes(2)
			})

			test("create branch: juristic collision check runs with no self-exclusion (POST never auto-links)", async () => {
				// Act
				await service.execute(makeRequest())

				// Assert — exclude id is null on create: ANY live business with the
				// same juristic number conflicts.
				expect(mockBusinessRepo.findLiveJuristicConflict).toHaveBeenCalledWith("105557026729", null)
				expect(mockBusinessRepo.insertBusiness).toHaveBeenCalledTimes(1)
			})
		})

		describe("Unhappy cases", () => {
			test("returns MemberValidationError when the link branch's business_id is unknown or soft-deleted", async () => {
				// Arrange
				mockBusinessRepo.existsLiveBusiness.mockResolvedValue(ok(false))

				// Act
				const result = await service.execute(makeRequest({ business: { kind: "link", businessId: 999 } }))

				// Assert — 400, not 409: the id simply matches no live row.
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
				expect(mockRepo.insertMember).not.toHaveBeenCalled()
			})

			test("returns BUSINESS_JURISTIC_CONFLICT when a live business already holds the juristic number", async () => {
				// Arrange — #62 D3: POST never silently auto-links.
				mockBusinessRepo.findLiveJuristicConflict.mockResolvedValue(ok(7))

				// Act
				const result = await service.execute(makeRequest())

				// Assert
				const error = result._unsafeUnwrapErr() as MemberConflictError
				expect(error).toBeInstanceOf(MemberConflictError)
				expect(error.reason).toBe("BUSINESS_JURISTIC_CONFLICT")
				expect(error.message).toBe("A business with this registration number already exists")
				expect(mockBusinessRepo.insertBusiness).not.toHaveBeenCalled()
			})

			test("returns DatabaseError when the link target dies between the pre-check and the tx lock", async () => {
				// Arrange — soft-delete isolation safety net: the outside-tx
				// pre-check passed, but the tx-scoped FOR UPDATE re-check finds the
				// target already soft-deleted (a concurrent ADR-0023 cascade won).
				mockBusinessRepo.lockLiveBusinessById.mockResolvedValue(null)

				// Act
				const result = await service.execute(makeRequest({ business: { kind: "link", businessId: 42 } }))

				// Assert — the tx aborts; no member is written onto a dead business.
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
				expect(mockRepo.insertMember).not.toHaveBeenCalled()
			})
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberValidationError when the position code is unknown", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(ok(null))

			// Act
			const result = await service.execute(makeRequest({ position: "CHANCELLOR" }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns MemberValidationError when the position is inactive", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "OLD_ROLE", nameTh: "", nameEn: "", cardinality: "MULTIPLE", parentPositionCode: null, displayOrder: 0, isActive: false })
			)

			// Act
			const result = await service.execute(makeRequest({ position: "OLD_ROLE" }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns POSITION_OCCUPIED conflict when a SINGLE position is already held", async () => {
			// Arrange
			mockRepo.getPositionByCode.mockResolvedValue(
				ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
			)
			mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(1))

			// Act
			const result = await service.execute(makeRequest({ position: "PRESIDENT" }))

			// Assert
			const error = result._unsafeUnwrapErr() as MemberConflictError
			expect(error.reason).toBe("POSITION_OCCUPIED")
		})

		test("returns MemberValidationError when id_card_expiry_date is in the past", async () => {
			// Act
			const result = await service.execute(makeRequest({ idCardExpiryDate: new Date("2020-01-01") }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns MemberValidationError when id_card_no is not 13 digits", async () => {
			// Act
			const result = await service.execute(makeRequest({ idCardNo: "123" }))

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(MemberValidationError)
		})

		test("returns CryptoError when encryption fails", async () => {
			// Arrange
			mockEncryption.encrypt.mockReturnValue(err(new CryptoError("aes boom")))

			// Act
			const result = await service.execute(makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(CryptoError)
		})

		test("returns DUPLICATE_ID_CARD conflict when the hash already exists", async () => {
			// Arrange
			mockRepo.countMemberByIdCardHash.mockResolvedValue(ok(1))

			// Act
			const result = await service.execute(makeRequest())

			// Assert
			const error = result._unsafeUnwrapErr() as MemberConflictError
			expect(error).toBeInstanceOf(MemberConflictError)
			expect(error.reason).toBe("DUPLICATE_ID_CARD")
		})

		test("returns DUPLICATE_PHONE_NO / DUPLICATE_EMAIL / DUPLICATE_LINE_ID conflicts per live-contact match", async () => {
			const cases: [{ phoneNo: boolean; email: boolean; lineId: boolean }, string][] = [
				[{ phoneNo: true, email: false, lineId: false }, "DUPLICATE_PHONE_NO"],
				[{ phoneNo: false, email: true, lineId: false }, "DUPLICATE_EMAIL"],
				[{ phoneNo: false, email: false, lineId: true }, "DUPLICATE_LINE_ID"],
			]
			for (const [conflicts, expectedReason] of cases) {
				mockRepo.findLiveContactConflicts.mockResolvedValue(ok(conflicts))

				const result = await service.execute(makeRequest())

				const error = result._unsafeUnwrapErr() as MemberConflictError
				expect(error).toBeInstanceOf(MemberConflictError)
				expect(error.reason).toBe(expectedReason)
				expect(mockRepo.findLiveContactConflicts).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.anything(), null)
			}
		})

		test("returns DatabaseError when a transaction step fails", async () => {
			// Arrange — a step throws inside the tx: the whole transaction rolls back.
			mockBusinessRepo.insertBusiness.mockRejectedValue(new DatabaseError("insert failed"))

			// Act
			const result = await service.execute(makeRequest())

			// Assert
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			expect(mockRepo.insertMember).not.toHaveBeenCalled()
		})
	})
})

function makeRequest(overrides: Partial<CreateMemberRequest> = {}): CreateMemberRequest {
	return {
		registrationType: "INDIVIDUAL",
		companyCertificate: "members/documents/cert.jpg",
		idCardImage: "members/documents/idcard.jpg",
		profileAvatar: "members/avatars/a.jpg",
		titleNameTh: "นาง",
		firstNameTh: "มาลี",
		lastNameTh: "รักสุข",
		titleNameEn: "Miss",
		firstNameEn: "Malee",
		lastNameEn: "Raksuk",
		nickname: "malee",
		gender: "FEMALE",
		dateOfBirth: new Date("1985-08-20"),
		nationality: "Thai",
		idCardNo: "1234567890123",
		idCardExpiryDate: new Date("2027-08-19"),
		phoneNo: "0812345678",
		email: "malee@example.com",
		lineId: "malee.line",
		shirtSize: "M",
		position: "GENERAL_MEMBER",
		business: {
			kind: "create",
			business: {
				name: "V Foods",
				juristicRegistrationNo: "105557026729",
				categoryId: 1,
				address: "Bangkok",
				location: [13.72, 100.55],
				description: "desc",
				coreBusiness: "canned food",
				website: "https://vfoods.co.th",
				logo: "members/business/logo.jpg",
				product: "members/business/product.jpg",
			},
		},
		...overrides,
	}
}
