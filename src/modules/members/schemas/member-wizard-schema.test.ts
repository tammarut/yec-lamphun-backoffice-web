// @vitest-environment node
import { describe, expect, test } from "vitest"
import { safeParse, type SafeParseResult } from "valibot"

import { MemberWizardSchema, type MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

/** Local-calendar ISO date (YYYY-MM-DD) — matches how the schema computes "today". */
function localIsoDate(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

function fileValue(name = "photo.png"): { file: File | null; existingUrl: string | null } {
	return { file: new File(["bytes"], name, { type: "image/png" }), existingUrl: null }
}

function makeValidFormValues(): MemberWizardFormValues {
	return {
		registration_type: "INDIVIDUAL",
		company_certificate: { file: null, existingUrl: null },
		id_card_image: fileValue("id-card.jpg"),
		profile_avatar: fileValue("avatar.png"),
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		title_name_en: "Mr.",
		first_name_en: "Somchai",
		last_name_en: "Jaidee",
		nickname: "ชาย",
		gender: "MALE",
		date_of_birth: "1990-06-15",
		nationality: "ไทย",
		id_card_no: "1234567890123",
		id_card_expiry_date: localIsoDate(new Date()),
		phone_no: "081-234-5678",
		email: "somchai@example.com",
		line_id: "@somchai",
		shirt_size: "M",
		position: "GENERAL_MEMBER",
		business: {
			name: "สมชาย คอนสตรัคชั่น",
			juristic_registration_no: "0505561000123",
			category_id: "2",
			address: "123 หมู่ 4 ต.เวียงยอง",
			latitude: "18.5753",
			longitude: "99.0094",
			description: "รับเหมาก่อสร้างครบวงจร",
			core_business: "ก่อสร้าง",
			website: "www.example.com",
			logo: fileValue("logo.png"),
			product: { file: null, existingUrl: null },
		},
	}
}

function issuePaths(result: SafeParseResult<typeof MemberWizardSchema>): string[][] {
	if (result.success) {
		return []
	}
	return result.issues.map((issue) => (issue.path ?? []).map((item) => String(item.key)))
}

function issueMessages(result: SafeParseResult<typeof MemberWizardSchema>): string[] {
	if (result.success) {
		return []
	}
	return result.issues.map((issue) => issue.message)
}

describe("MemberWizardSchema", () => {
	describe("Happy cases", () => {
		test("accepts a fully valid form", () => {
			const result = safeParse(MemberWizardSchema, makeValidFormValues())
			expect(result.success).toBe(true)
		})

		test("accepts a minimal form — every API-optional field empty, no files at all", () => {
			const values = makeValidFormValues()
			values.company_certificate = { file: null, existingUrl: null }
			values.id_card_image = { file: null, existingUrl: null }
			values.profile_avatar = { file: null, existingUrl: null }
			values.title_name_en = ""
			values.first_name_en = ""
			values.last_name_en = ""
			values.email = ""
			values.line_id = ""
			values.shirt_size = ""
			values.business.address = ""
			values.business.latitude = ""
			values.business.longitude = ""
			values.business.core_business = ""
			values.business.website = ""
			values.business.logo = { file: null, existingUrl: null }
			const result = safeParse(MemberWizardSchema, values)
			expect(result.success).toBe(true)
		})

		test("accepts an id_card_expiry_date of today (calendar-date compare, today is valid)", () => {
			const values = makeValidFormValues()
			values.id_card_expiry_date = localIsoDate(new Date())
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})

		test("accepts an id_card_no that is exactly 13 digits", () => {
			const values = makeValidFormValues()
			values.id_card_no = "0000000000000"
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})

		test("accepts an empty email (API-optional, format only checked when present)", () => {
			const values = makeValidFormValues()
			values.email = ""
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})

		test("accepts numeric lat/long strings and integer-like category ids", () => {
			const values = makeValidFormValues()
			values.business.latitude = "-18.5"
			values.business.longitude = "99"
			values.business.category_id = "14"
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})
	})

	describe("Unhappy cases", () => {
		test("rejects each of the six API-required fields the mockup marks optional", () => {
			const scalarCases: [(values: MemberWizardFormValues) => void, string][] = [
				[(values) => (values.nickname = ""), "nickname"],
				[(values) => (values.date_of_birth = ""), "date_of_birth"],
				[(values) => (values.nationality = ""), "nationality"],
				[(values) => (values.id_card_expiry_date = ""), "id_card_expiry_date"],
			]
			for (const [mutate, expectedPath] of scalarCases) {
				const values = makeValidFormValues()
				mutate(values)
				const paths = issuePaths(safeParse(MemberWizardSchema, values))
				expect(paths).toContainEqual([expectedPath])
			}

			const businessCases: [(values: MemberWizardFormValues) => void, string][] = [
				[(values) => (values.business.juristic_registration_no = ""), "juristic_registration_no"],
				[(values) => (values.business.description = ""), "description"],
			]
			for (const [mutate, expectedPath] of businessCases) {
				const values = makeValidFormValues()
				mutate(values)
				const paths = issuePaths(safeParse(MemberWizardSchema, values))
				expect(paths).toContainEqual(["business", expectedPath])
			}
		})

		test("rejects whitespace-only required text as empty (Thai message)", () => {
			const values = makeValidFormValues()
			values.first_name_th = "   "
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["first_name_th"])
			expect(issueMessages(result)).toContain("กรุณากรอกชื่อ")
		})

		test("rejects an id_card_no shorter than 13 digits with the Thai message", () => {
			const values = makeValidFormValues()
			values.id_card_no = "123456789012"
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["id_card_no"])
			expect(issueMessages(result)).toContain("เลขบัตรประชาชนต้องมีครบ 13 หลัก")
		})

		test("rejects an id_card_expiry_date before today (yesterday fails)", () => {
			const values = makeValidFormValues()
			const yesterday = new Date()
			yesterday.setDate(yesterday.getDate() - 1)
			values.id_card_expiry_date = localIsoDate(yesterday)
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["id_card_expiry_date"])
			expect(issueMessages(result)).toContain("วันหมดอายุบัตรต้องไม่เป็นวันที่ผ่านมาแล้ว")
		})

		test("requires the company certificate file for JURISTIC_PERSON and forwards the issue to the field", () => {
			const values = makeValidFormValues()
			values.registration_type = "JURISTIC_PERSON"
			values.company_certificate = { file: null, existingUrl: null }
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["company_certificate"])
			expect(issueMessages(result)).toContain("นิติบุคคลต้องแนบหนังสือรับรองบริษัท")
		})

		test("accepts a missing company certificate for INDIVIDUAL", () => {
			const values = makeValidFormValues()
			values.registration_type = "INDIVIDUAL"
			values.company_certificate = { file: null, existingUrl: null }
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})

		test("rejects a malformed phone number with the mockup's example message", () => {
			const values = makeValidFormValues()
			values.phone_no = "12345"
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["phone_no"])
			expect(issueMessages(result)).toContain("รูปแบบเบอร์โทรไม่ถูกต้อง เช่น 081-234-5678")
		})

		test("rejects a present-but-malformed email", () => {
			const values = makeValidFormValues()
			values.email = "not-an-email"
			const result = safeParse(MemberWizardSchema, values)
			expect(issuePaths(result)).toContainEqual(["email"])
			expect(issueMessages(result)).toContain("รูปแบบอีเมลไม่ถูกต้อง")
		})

		test("rejects enum values outside the API picklists", () => {
			const values = makeValidFormValues()
			values.gender = "UNKNOWN" as MemberWizardFormValues["gender"]
			expect(issuePaths(safeParse(MemberWizardSchema, values))).toContainEqual(["gender"])

			const values2 = makeValidFormValues()
			values2.title_name_th = "ดร." as MemberWizardFormValues["title_name_th"]
			expect(issuePaths(safeParse(MemberWizardSchema, values2))).toContainEqual(["title_name_th"])

			const values3 = makeValidFormValues()
			values3.position = "CEO" as MemberWizardFormValues["position"]
			expect(issuePaths(safeParse(MemberWizardSchema, values3))).toContainEqual(["position"])
		})

		test("rejects an unset category (empty select) and non-numeric coordinates", () => {
			const values = makeValidFormValues()
			values.business.category_id = ""
			expect(issuePaths(safeParse(MemberWizardSchema, values))).toContainEqual(["business", "category_id"])

			const values2 = makeValidFormValues()
			values2.business.latitude = "abc"
			expect(issuePaths(safeParse(MemberWizardSchema, values2))).toContainEqual(["business", "latitude"])
		})

		test("rejects a malformed date_of_birth", () => {
			const values = makeValidFormValues()
			values.date_of_birth = "15/06/1990"
			expect(issuePaths(safeParse(MemberWizardSchema, values))).toContainEqual(["date_of_birth"])
		})

		test("rejects text exceeding the DB VARCHAR limits (22001 → 500 otherwise)", () => {
			const cases: [(values: MemberWizardFormValues) => void, string, number][] = [
				[(values) => (values.first_name_th = "ก".repeat(101)), "first_name_th", 100],
				[(values) => (values.nickname = "n".repeat(101)), "nickname", 100],
				[(values) => (values.email = `${"e".repeat(251)}@x.co`), "email", 255],
				[(values) => (values.line_id = "l".repeat(101)), "line_id", 100],
				[(values) => (values.business.juristic_registration_no = "0".repeat(51)), "business.juristic_registration_no", 50],
			]
			for (const [mutate, path, limit] of cases) {
				const values = makeValidFormValues()
				mutate(values)
				const result = safeParse(MemberWizardSchema, values)
				const expectedPath = path.split(".")
				expect(issuePaths(result)).toContainEqual(expectedPath)
				expect(issueMessages(result)).toContain(`ความยาวต้องไม่เกิน ${limit} ตัวอักษร`)
			}

			// phone_no's 30-char limit is unreachable via the schema (the format
			// regex caps realistic input far lower); it is guarded by the input's
			// maxLength attribute instead.
			const phoneValues = makeValidFormValues()
			phoneValues.phone_no = `0${"1".repeat(30)}`
			expect(issuePaths(safeParse(MemberWizardSchema, phoneValues))).toContainEqual(["phone_no"])

			// At exactly the limit the values are fine.
			const values = makeValidFormValues()
			values.first_name_th = "ก".repeat(100)
			expect(safeParse(MemberWizardSchema, values).success).toBe(true)
		})
	})
})
