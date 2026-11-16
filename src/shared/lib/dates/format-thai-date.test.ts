import { describe, expect, test } from "vitest"

import { formatThaiDate } from "src/shared/lib/dates/format-thai-date"

/**
 * An ISO instant whose LOCAL calendar parts are the given Y/M/D — built from
 * numeric local constructor args so the expectations below hold in every
 * timezone the suite might run under (UTC-midnight literals would shift a day
 * west of Greenwich).
 */
function isoAtLocal(year: number, month: number, day: number, hour: number): string {
	return new Date(year, month - 1, day, hour).toISOString()
}

describe("formatThaiDate", () => {
	describe("Happy cases", () => {
		test("formats an ISO date-time as a Thai Buddhist-Era short date", () => {
			expect(formatThaiDate(isoAtLocal(2026, 8, 12, 10))).toBe("12 ส.ค. 2569")
		})

		test("keeps the calendar day stable across the +543 year conversion", () => {
			expect(formatThaiDate(isoAtLocal(2024, 6, 1, 10))).toBe("1 มิ.ย. 2567")
		})

		test("pins a date-only input to local midnight so the calendar day is locale-independent", () => {
			expect(formatThaiDate("2026-08-12")).toBe("12 ส.ค. 2569")
		})
	})

	describe("Unhappy cases", () => {
		test("renders a dash for an unparseable date", () => {
			expect(formatThaiDate("not-a-date")).toBe("-")
		})
	})
})
