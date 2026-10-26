import { describe, expect, test } from "vitest"

import { computeRenewalSeasonBoundary } from "./renewal-season"

describe("computeRenewalSeasonBoundary", () => {
	describe("Happy cases", () => {
		test.each`
			label                                                                       | now                           | expectedBoundary
			${"30 November (Bangkok) — pre-season, straggler semantics"}                | ${"2026-11-30T10:00:00.000Z"} | ${"2026-01-01T00:00:00.000Z"}
			${"Bangkok midnight entering 1 December (30 Nov 17:00 UTC) — season flips"} | ${"2026-11-30T17:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"1 December evening (Bangkok) — opening day"}                             | ${"2026-12-01T10:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"mid-December"}                                                           | ${"2026-12-15T00:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"31 December 16:59:59 UTC — still December in Bangkok"}                   | ${"2026-12-31T16:59:59.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"31 December 17:00 UTC (= Bangkok 1 January) — boundary must not jump"}   | ${"2026-12-31T17:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"January run — straggler semantics"}                                      | ${"2027-01-01T10:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"February run — straggler semantics"}                                     | ${"2027-02-28T10:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"mid-year run — straggler semantics"}                                     | ${"2027-06-15T10:00:00.000Z"} | ${"2027-01-01T00:00:00.000Z"}
			${"next season's December — boundary advances one year"}                    | ${"2027-12-01T10:00:00.000Z"} | ${"2028-01-01T00:00:00.000Z"}
		`("$label", ({ now, expectedBoundary }: { now: string; expectedBoundary: string }) => {
			const boundary = computeRenewalSeasonBoundary(new Date(now))

			expect(boundary.toISOString()).toBe(expectedBoundary)
		})
	})

	describe("Purity", () => {
		test("does not mutate the input date and returns a new Date", () => {
			const now = new Date("2026-12-01T10:00:00.000Z")
			const before = now.getTime()

			const boundary = computeRenewalSeasonBoundary(now)

			expect(now.getTime()).toBe(before)
			expect(boundary).not.toBe(now)
		})
	})
})
