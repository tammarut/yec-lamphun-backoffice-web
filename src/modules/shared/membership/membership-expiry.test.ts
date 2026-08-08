import { describe, expect, test } from "vitest"

import { computeMembershipExpiry } from "./membership-expiry"

describe("computeMembershipExpiry", () => {
	describe("Happy cases", () => {
		test("mid-2026 now -> end of next year (2027-12-31T23:59:59.999Z)", () => {
			const now = new Date("2026-06-15T10:00:00Z")

			expect(computeMembershipExpiry(now).toISOString()).toBe("2027-12-31T23:59:59.999Z")
		})

		test("late-2026 now (Dec 31) still lands on the NEXT calendar year (2027-12-31)", () => {
			// Guards against a +365-days interpretation: Dec 31 2026 + 1 year, end
			// of day, would still be 2027-12-31 here — but a naive "+1 year then
			// end-of-year-of-now" could wrongly yield 2026-12-31. This pins the
			// "next calendar year" rule.
			const now = new Date("2026-12-31T23:00:00Z")

			expect(computeMembershipExpiry(now).toISOString()).toBe("2027-12-31T23:59:59.999Z")
		})

		test("Jan 1 2027 now -> end of the FOLLOWING year (2028-12-31)", () => {
			// The "next calendar year" after 2027 is 2028.
			const now = new Date("2027-01-01T00:00:00Z")

			expect(computeMembershipExpiry(now).toISOString()).toBe("2028-12-31T23:59:59.999Z")
		})
	})

	describe("Purity", () => {
		test("does not mutate the input date", () => {
			const now = new Date("2026-08-08T05:30:00.000Z")
			const snapshot = new Date(now)

			computeMembershipExpiry(now)

			expect(now.getTime()).toBe(snapshot.getTime())
		})

		test("returns a NEW Date instance (not the input reference)", () => {
			const now = new Date("2026-08-08T05:30:00.000Z")

			const result = computeMembershipExpiry(now)

			expect(result).not.toBe(now)
		})
	})
})
