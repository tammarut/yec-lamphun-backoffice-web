import { describe, expect, test } from "vitest"

import { fullNameTh, positionLabel, renewalStatusLabel, renewalStatusTone } from "src/modules/membership-renewals/components/renewal-labels"

describe("renewal-labels", () => {
	describe("positionLabel", () => {
		test("maps a known position code to its official Thai name", () => {
			expect(positionLabel("GENERAL_MEMBER")).toBe("สมาชิกทั่วไป")
			expect(positionLabel("PRESIDENT")).toBe("ประธาน YEC Lamphun")
		})

		test("falls back to the raw code for unknown codes", () => {
			expect(positionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW")
		})
	})

	describe("fullNameTh", () => {
		test("glues the title to the first name with a space before the surname", () => {
			expect(fullNameTh({ title_name_th: "นาย", first_name_th: "สมชาย", last_name_th: "ใจดี" })).toBe("นายสมชาย ใจดี")
		})
	})

	describe("renewalStatusLabel", () => {
		test("renders the REJECTED pill audience-aware (admin vs member wording)", () => {
			expect(renewalStatusLabel("REJECTED", true)).toBe("ไม่อนุมัติ")
			expect(renewalStatusLabel("REJECTED", false)).toBe("กรุณาติดต่อเจ้าหน้าที่")
		})

		test("renders the other statuses identically for both audiences", () => {
			expect(renewalStatusLabel("PENDING_REVIEW", true)).toBe("รอตรวจสอบ")
			expect(renewalStatusLabel("PENDING_REVIEW", false)).toBe("รอตรวจสอบ")
			expect(renewalStatusLabel("APPROVED", true)).toBe("ปกติ")
			expect(renewalStatusLabel("APPROVED", false)).toBe("ปกติ")
		})
	})

	describe("renewalStatusTone", () => {
		test("maps each status to its semantic tone", () => {
			expect(renewalStatusTone("REJECTED")).toBe("destructive")
			expect(renewalStatusTone("APPROVED")).toBe("success")
			expect(renewalStatusTone("PENDING_REVIEW")).toBe("warning")
		})
	})
})
