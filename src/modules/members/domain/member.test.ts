import { describe, expect, test, beforeEach } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { err, ok } from "neverthrow"
import { CryptoError, type IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { MemberValidationError } from "./errors"
import type { CreateMemberRequest } from "../use-case/create-new-member/create-member.types"
import type { PositionReadModel } from "./member-read-models"
import { Member } from "./member"

function makeRequest(overrides: Partial<CreateMemberRequest> = {}): CreateMemberRequest {
	return {
		registrationType: "INDIVIDUAL",
		companyCertificate: null,
		idCardImage: null,
		profileAvatar: null,
		titleNameTh: "นาง",
		firstNameTh: "มาลี",
		lastNameTh: "รักสุข",
		titleNameEn: null,
		firstNameEn: null,
		lastNameEn: null,
		nickname: "malee",
		gender: "FEMALE",
		dateOfBirth: new Date("1985-08-20"),
		nationality: "Thai",
		idCardNo: "1234567890123",
		idCardExpiryDate: new Date("2027-08-19"),
		phoneNo: "0812345678",
		email: null,
		lineId: null,
		shirtSize: null,
		position: "GENERAL_MEMBER",
		business: {
			name: "V Foods",
			juristicRegistrationNo: "105557026729",
			categoryId: 1,
			address: null,
			location: [13.72, 100.55],
			description: "desc",
			coreBusiness: null,
			website: null,
			logo: null,
			product: null,
		},
		...overrides,
	}
}

const activePosition: PositionReadModel = {
	code: "GENERAL_MEMBER",
	nameTh: "สมาชิกทั่วไป",
	nameEn: "General Member",
	cardinality: "MULTIPLE",
	parentPositionCode: null,
	displayOrder: 900,
	isActive: true,
}

describe("Member.create", () => {
	let mockEncryption: MockProxy<IEncryptionService>
	let mockBlindIndex: MockProxy<IBlindIndexService>

	beforeEach(() => {
		mockEncryption = mock<IEncryptionService>()
		mockBlindIndex = mock<IBlindIndexService>()
		mockEncryption.encrypt.mockReturnValue(ok("enc-base64"))
		mockBlindIndex.hash.mockReturnValue(ok("hash-hex"))
	})

	describe("Happy cases", () => {
		test("assembles a Member with cipher + defaults + business VO from a valid request", () => {
			const now = new Date("2026-07-13T10:00:00Z")
			const result = Member.create(makeRequest(), activePosition, mockEncryption, mockBlindIndex, now)
			expect(result.isOk()).toBe(true)
			if (!result.isOk()) {
				return
			}
			expect(result.value.idCardNo).toBe("enc-base64")
			expect(result.value.idCardNoHash).toBe("hash-hex")
			expect(result.value.status).toBe("ACTIVE")
			expect(result.value.memberSince).toBe(now)
			expect(result.value.renewalSuccessfulCount).toBe(0)
		})

		test("builds the business VO with location swapped to [long, lat]", () => {
			const result = Member.create(makeRequest(), activePosition, mockEncryption, mockBlindIndex, new Date())
			if (!result.isOk()) {
				throw new Error("expected ok")
			}
			// Input was [13.72, 100.55] [lat, long] → VO stores [long, lat]
			expect(result.value.business.location).toEqual([100.55, 13.72])
		})

		test("collects documents from id_card_image + company_certificate", () => {
			const result = Member.create(
				makeRequest({
					idCardImage: "members/documents/idcard.jpg",
					companyCertificate: "members/documents/cert.jpg",
				}),
				activePosition,
				mockEncryption,
				mockBlindIndex,
				new Date()
			)
			if (!result.isOk()) {
				throw new Error("expected ok")
			}
			expect(result.value.documents).toHaveLength(2)
			expect(result.value.documents[0]?.type).toBe("ID_CARD")
			expect(result.value.documents[1]?.type).toBe("COMPANY_CERTIFICATE")
		})

		test("expires_at is one year after the provided 'now', at end of day", () => {
			const now = new Date(2026, 0, 15, 10, 0, 0)
			const result = Member.create(makeRequest(), activePosition, mockEncryption, mockBlindIndex, now)
			if (!result.isOk()) {
				throw new Error("expected ok")
			}
			expect(result.value.expiresAt.getFullYear()).toBe(2027)
			expect(result.value.expiresAt.getHours()).toBe(23)
		})
	})

	describe("Unhappy cases", () => {
		test("returns MemberValidationError when id_card_expiry_date is in the past", () => {
			const result = Member.create(makeRequest({ idCardExpiryDate: new Date("2020-01-01") }), activePosition, mockEncryption, mockBlindIndex, new Date())
			expect(result.isErr()).toBe(true)
			if (!result.isErr()) {
				return
			}
			expect(result.error).toBeInstanceOf(MemberValidationError)
		})

		test("returns MemberValidationError when the position is inactive", () => {
			const inactive: PositionReadModel = { ...activePosition, isActive: false }
			const result = Member.create(makeRequest(), inactive, mockEncryption, mockBlindIndex, new Date())
			expect(result.isErr()).toBe(true)
			if (!result.isErr()) {
				return
			}
			expect(result.error).toBeInstanceOf(MemberValidationError)
			expect(result.error.message).toContain("not active")
		})

		test("returns MemberValidationError when id_card_no is not 13 digits", () => {
			const result = Member.create(makeRequest({ idCardNo: "123" }), activePosition, mockEncryption, mockBlindIndex, new Date())
			expect(result.isErr()).toBe(true)
			if (!result.isErr()) {
				return
			}
			expect(result.error).toBeInstanceOf(MemberValidationError)
		})

		test("returns CryptoError when encryption fails", () => {
			mockEncryption.encrypt.mockReturnValue(err(new CryptoError("aes boom")))
			const result = Member.create(makeRequest(), activePosition, mockEncryption, mockBlindIndex, new Date())
			expect(result.isErr()).toBe(true)
			if (!result.isErr()) {
				return
			}
			expect(result.error).toBeInstanceOf(CryptoError)
		})
	})
})
