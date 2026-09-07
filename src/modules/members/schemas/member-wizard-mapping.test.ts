// @vitest-environment node
import { describe, expect, test } from "vitest"

import { buildCreatePayload, computeAgeLabel, type UploadedFilePaths } from "src/modules/members/schemas/member-wizard-mapping"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

const uploads: UploadedFilePaths = {
	id_card_image_file_path: "members/documents/id_card_image_01ULID.jpg",
	company_certificate_file_path: "members/documents/company_cert_02ULID.png",
	profile_avatar_file_path: "members/profile_avatars/profile_avatar_03ULID.png",
	business_logo_file_path: "members/business/logo_04ULID.png",
	business_product_file_path: null,
}

function makeFormValues(): MemberWizardFormValues {
	return {
		registration_type: "JURISTIC_PERSON",
		company_certificate: { file: new File(["cert"], "cert.png", { type: "image/png" }), existingUrl: null },
		id_card_image: { file: new File(["id"], "id.jpg", { type: "image/jpeg" }), existingUrl: null },
		profile_avatar: { file: new File(["av"], "av.png", { type: "image/png" }), existingUrl: null },
		title_name_th: "นางสาว",
		first_name_th: "มินตรา",
		last_name_th: "น่ารัก",
		title_name_en: "Miss",
		first_name_en: "Mintra",
		last_name_en: "Narak",
		nickname: "มิน",
		gender: "FEMALE",
		date_of_birth: "2000-03-10",
		nationality: "ไทย",
		id_card_no: "3101501234567",
		id_card_expiry_date: "2030-12-31",
		phone_no: "090-222-2222",
		email: "min@example.com",
		line_id: "min_fashion",
		shirt_size: "S",
		position: "GENERAL_MEMBER",
		business: {
			name: "มินตรา แฟชั่น",
			juristic_registration_no: "0205562000456",
			category_id: "11",
			address: "44 ถ.เจริญธรรม",
			latitude: "18.5753",
			longitude: "99.0094",
			description: "เสื้อผ้าแฟชั่นนำเข้า",
			core_business: "แฟชั่น",
			website: "www.mintra.co",
			logo: { file: new File(["logo"], "logo.png", { type: "image/png" }), existingUrl: null },
			product: { file: null, existingUrl: null },
		},
	}
}

describe("buildCreatePayload", () => {
	describe("Happy cases", () => {
		test("attaches uploaded file paths at the exact wire keys", () => {
			const payload = buildCreatePayload(makeFormValues(), uploads)
			expect(payload.company_certificate).toBe("members/documents/company_cert_02ULID.png")
			expect(payload.id_card_image).toBe("members/documents/id_card_image_01ULID.jpg")
			expect(payload.profile_avatar).toBe("members/profile_avatars/profile_avatar_03ULID.png")
			expect(payload.business.logo).toBe("members/business/logo_04ULID.png")
			expect(payload.business.product).toBeNull()
		})

		test("sends null for every file path when nothing was uploaded", () => {
			const values = makeFormValues()
			const payload = buildCreatePayload(values, null)
			expect(payload.company_certificate).toBeNull()
			expect(payload.id_card_image).toBeNull()
			expect(payload.profile_avatar).toBeNull()
			expect(payload.business.logo).toBeNull()
			expect(payload.business.product).toBeNull()
		})

		test("parses lat/long strings into the wire [lat, long] pair and category id into a number", () => {
			const payload = buildCreatePayload(makeFormValues(), uploads)
			expect(payload.business.location).toEqual([18.5753, 99.0094])
			expect(payload.business.category_id).toBe(11)
		})

		test("sends null for empty optional text fields and omits an empty shirt_size entirely", () => {
			const values = makeFormValues()
			values.title_name_en = ""
			values.first_name_en = ""
			values.last_name_en = ""
			values.email = ""
			values.line_id = ""
			values.shirt_size = ""
			values.business.address = ""
			values.business.core_business = ""
			values.business.website = ""
			const payload = buildCreatePayload(values, null)
			expect(payload.title_name_en).toBeNull()
			expect(payload.first_name_en).toBeNull()
			expect(payload.last_name_en).toBeNull()
			expect(payload.email).toBeNull()
			expect(payload.line_id).toBeNull()
			expect(payload.business.address).toBeNull()
			expect(payload.business.core_business).toBeNull()
			expect(payload.business.website).toBeNull()
			expect("shirt_size" in payload).toBe(false)
		})

		test("keeps shirt_size when set and location null when coordinates are empty", () => {
			const values = makeFormValues()
			values.shirt_size = "2XL"
			values.business.latitude = ""
			values.business.longitude = ""
			const payload = buildCreatePayload(values, uploads)
			expect(payload.shirt_size).toBe("2XL")
			expect(payload.business.location).toBeNull()
		})

		test("payload JSON round-trips without undefined keys leaking", () => {
			const values = makeFormValues()
			values.shirt_size = ""
			const json = JSON.stringify(buildCreatePayload(values, null))
			expect(json).not.toContain("shirt_size")
			expect(json).not.toContain("undefined")
		})
	})

	describe("Unhappy cases", () => {
		test("trims whitespace on text fields before sending", () => {
			const values = makeFormValues()
			values.first_name_th = " สมชาย "
			const payload = buildCreatePayload(values, null)
			expect(payload.first_name_th).toBe("สมชาย")
		})
	})
})

describe("computeAgeLabel", () => {
	describe("Happy cases", () => {
		test("renders years and remaining months from a date of birth", () => {
			expect(computeAgeLabel("2000-01-10", new Date("2026-03-05T00:00:00"))).toBe("26 ปี 1 เดือน")
		})

		test("borrows a month when the day-of-month has not been reached yet", () => {
			expect(computeAgeLabel("2000-01-10", new Date("2026-01-05T00:00:00"))).toBe("25 ปี 11 เดือน")
		})

		test("renders months only when under one year", () => {
			expect(computeAgeLabel("2026-06-01", new Date("2026-09-07T00:00:00"))).toBe("3 เดือน")
		})
	})

	describe("Unhappy cases", () => {
		test("returns empty for an empty or unparseable date", () => {
			expect(computeAgeLabel("", new Date())).toBe("")
			expect(computeAgeLabel("not-a-date", new Date())).toBe("")
		})
	})
})
