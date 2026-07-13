import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { err, ok } from "neverthrow"
import { CryptoError, type IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { CreateMemberRequest } from "./create-member.types"
import { MemberConflictError, MemberValidationError } from "./create-member.errors"
import type { IMemberRepository } from "../../interfaces"
import { CreateNewMemberService } from "./create-new-member.service"

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
		...overrides,
	}
}

describe("CreateNewMemberService", () => {
	let service: CreateNewMemberService
	let mockRepo: MockProxy<IMemberRepository>
	let mockEncryption: MockProxy<IEncryptionService>
	let mockBlindIndex: MockProxy<IBlindIndexService>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		mockEncryption = mock<IEncryptionService>()
		mockBlindIndex = mock<IBlindIndexService>()

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
		mockRepo.transaction.mockImplementation(async (cb) => cb("tx-handle" as never))
		mockRepo.insertMember.mockResolvedValue(ok(102))
		mockRepo.insertMemberDocuments.mockResolvedValue(ok(undefined))
		mockRepo.insertMemberBusiness.mockResolvedValue(ok(undefined))

		service = new CreateNewMemberService(mockRepo, mockEncryption, mockBlindIndex)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("returns ok(memberId) on a valid request with documents + business", async () => {
				const result = await service.execute(makeRequest())
				expect(result.isOk()).toBe(true)
				if (!result.isOk()) {
					return
				}
				expect(result.value).toBe(102)
			})

			test("inserts member, then documents, then business — in one transaction", async () => {
				await service.execute(makeRequest())
				expect(mockRepo.transaction).toHaveBeenCalledTimes(1)
				expect(mockRepo.insertMember).toHaveBeenCalledTimes(1)
				// insertMemberDocuments called once with the 2-document array
				expect(mockRepo.insertMemberDocuments).toHaveBeenCalledTimes(1)
				expect(mockRepo.insertMemberBusiness).toHaveBeenCalledTimes(1)
			})

			test("swaps business location from [lat,long] to [long,lat] inside the business VO", async () => {
				await service.execute(makeRequest())
				// insertMemberBusiness(tx, memberId, business) — business.location is [long, lat]
				expect(mockRepo.insertMemberBusiness).toHaveBeenCalledWith("tx-handle" as never, 102, expect.objectContaining({ _location: [100.55, 13.72] }))
			})

			test("skips documents insert when id_card_image and company_certificate are null", async () => {
				await service.execute(makeRequest({ idCardImage: null, companyCertificate: null }))
				expect(mockRepo.insertMemberDocuments).not.toHaveBeenCalled()
			})

			test("allows MULTIPLE position even when holders already exist", async () => {
				mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(5))
				const result = await service.execute(makeRequest({ position: "GENERAL_MEMBER" }))
				expect(result.isOk()).toBe(true)
			})

			test("allows a vacant SINGLE position", async () => {
				mockRepo.getPositionByCode.mockResolvedValue(
					ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
				)
				const result = await service.execute(makeRequest({ position: "PRESIDENT" }))
				expect(result.isOk()).toBe(true)
			})
		})

		describe("Unhappy cases", () => {
			test("returns MemberValidationError when the position code is unknown", async () => {
				mockRepo.getPositionByCode.mockResolvedValue(ok(null))
				const result = await service.execute(makeRequest({ position: "CHANCELLOR" }))
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(MemberValidationError)
			})

			test("returns MemberValidationError when the position is inactive", async () => {
				mockRepo.getPositionByCode.mockResolvedValue(
					ok({ code: "OLD_ROLE", nameTh: "", nameEn: "", cardinality: "MULTIPLE", parentPositionCode: null, displayOrder: 0, isActive: false })
				)
				const result = await service.execute(makeRequest({ position: "OLD_ROLE" }))
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(MemberValidationError)
			})

			test("returns MemberValidationError when id_card_expiry_date is in the past", async () => {
				const result = await service.execute(makeRequest({ idCardExpiryDate: new Date("2020-01-01") }))
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(MemberValidationError)
			})

			test("returns MemberValidationError when id_card_no is not 13 digits", async () => {
				const result = await service.execute(makeRequest({ idCardNo: "123" }))
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(MemberValidationError)
			})

			test("returns CryptoError when encryption fails", async () => {
				mockEncryption.encrypt.mockReturnValue(err(new CryptoError("aes boom")))
				const result = await service.execute(makeRequest())
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(CryptoError)
			})

			test("returns DUPLICATE_ID_CARD conflict when the hash already exists", async () => {
				mockRepo.countMemberByIdCardHash.mockResolvedValue(ok(1))
				const result = await service.execute(makeRequest())
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(MemberConflictError)
				expect((result.error as MemberConflictError).reason).toBe("DUPLICATE_ID_CARD")
			})

			test("returns POSITION_OCCUPIED conflict when a SINGLE position is already held", async () => {
				mockRepo.getPositionByCode.mockResolvedValue(
					ok({ code: "PRESIDENT", nameTh: "", nameEn: "", cardinality: "SINGLE", parentPositionCode: null, displayOrder: 100, isActive: true })
				)
				mockRepo.countActiveHolderByPosition.mockResolvedValue(ok(1))
				const result = await service.execute(makeRequest({ position: "PRESIDENT" }))
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect((result.error as MemberConflictError).reason).toBe("POSITION_OCCUPIED")
			})

			test("returns DatabaseError when an insert inside the tx fails (no throw escapes)", async () => {
				mockRepo.insertMember.mockResolvedValue(err(new DatabaseError("insert failed")))
				const result = await service.execute(makeRequest())
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(DatabaseError)
			})

			test("returns DatabaseError when the business insert fails", async () => {
				mockRepo.insertMemberBusiness.mockResolvedValue(err(new DatabaseError("biz insert failed")))
				const result = await service.execute(makeRequest())
				expect(result.isErr()).toBe(true)
				if (!result.isErr()) {
					return
				}
				expect(result.error).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
