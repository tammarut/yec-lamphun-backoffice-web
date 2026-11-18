import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * F2 tripwire (PR #157 scrutiny) for ADR-0033's load-bearing rule: every
 * renewal-semantics read of the Membership Payment Ledger must filter
 * `type = 'RENEWAL'`. The rule has no mechanical enforcement — the sites span
 * two modules and two SQL technologies, so no shared fragment can hold the
 * predicate — and the exact regression it guards (a REGISTRATION payment
 * surfacing as a renewal) fails silently. This guard asserts every ledger
 * lateral carries the filter; a dropped clause or a new unfiltered lateral
 * fails here and forces a review against ADR-0033.
 */

// vitest always runs from the repo root (vitest.config.mts), so cwd-relative
// paths are stable — import.meta.url is not a file: URL under the transform.
const RENEWALS_REPOSITORY = path.join(process.cwd(), "src/modules/membership-renewals/repository/membership-renewals.repository.ts")
const MEMBERS_QUERIES = path.join(process.cwd(), "src/modules/members/repository/sql/queries.sql")

const LATERAL_PREFIX = "WHERE member_id = m.id AND deleted_at IS NULL"
const FILTERED = "AND deleted_at IS NULL AND type = 'RENEWAL'"

function countOccurrences(source: string, needle: string): number {
	let count = 0
	let at = source.indexOf(needle)
	while (at !== -1) {
		count += 1
		at = source.indexOf(needle, at + needle.length)
	}
	return count
}

describe("payment-ledger read isolation (ADR-0033)", () => {
	it("renewals repository: every ledger LATERAL carries the type = 'RENEWAL' filter", () => {
		const source = readFileSync(RENEWALS_REPOSITORY, "utf8")
		const totalLaterals = countOccurrences(source, LATERAL_PREFIX)
		const filteredLaterals = countOccurrences(source, FILTERED)
		// Known renewal-semantics laterals as of #151: renewal-list main,
		// renewal-list pagination anchor, expired-list. A new lateral must add
		// BOTH counts or this test forces an ADR-0033 review.
		expect(totalLaterals).toBeGreaterThanOrEqual(3)
		expect(filteredLaterals).toBe(totalLaterals)
	})

	it("members queries.sql: the GetLatestRenewalByMemberId LATERAL carries the filter", () => {
		const source = readFileSync(MEMBERS_QUERIES, "utf8")
		const totalLaterals = countOccurrences(source, LATERAL_PREFIX)
		const filteredLaterals = countOccurrences(source, FILTERED)
		expect(totalLaterals).toBe(1)
		expect(filteredLaterals).toBe(totalLaterals)
	})
})
