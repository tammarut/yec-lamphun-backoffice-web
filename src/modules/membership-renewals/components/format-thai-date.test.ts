import { describe, expect, test } from "vitest"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"

describe("formatThaiDate", () => {
	describe("Happy cases", () => {
		test("formats an ISO date-time as a Thai Buddhist-Era short date", () => {
			expect(formatThaiDate("2026-08-12T00:00:00.000Z")).toBe("12 ส.ค. 2569")
		})

		test("keeps the calendar day stable across the +543 year conversion", () => {
			expect(formatThaiDate("2024-06-01T00:00:00.000Z")).toBe("1 มิ.ย. 2567")
		})
	})

	describe("Unhappy cases", () => {
		test("renders a dash for an unparseable date", () => {
			expect(formatThaiDate("not-a-date")).toBe("-")
		})
	})
})
