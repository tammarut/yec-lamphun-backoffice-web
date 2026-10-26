/**
 * Renewal Season boundary rule (CONTEXT.md): UTC midnight of the 1 January
 * that opens the Membership Year the current Renewal Season collects for —
 * the Membership Expiry predicate of the Annual Membership Expiry is
 * `expires_at < boundary` (ADR-0027; NULL expiries deliberately never match —
 * repo-review ruling, PR #109).
 *
 * Lives beside its only caller ({@link AnnualMembershipExpiryService}) —
 * deliberately NOT in `src/modules/shared/membership/`: unlike
 * `computeMembershipExpiry` (shared by two feature modules), nothing else
 * consumes this rule (repo-review ruling, PR #109). Pure function — no DI
 * token / container registration.
 *
 * The season year is read from the BANGKOK wall clock (the ADR-0019
 * dual-pinning precedent: SQL writes and JS reads must agree on timezone —
 * the same `Asia/Bangkok` policy the dashboard's yearly query pins with
 * `AT TIME ZONE 'Asia/Bangkok'`): from 1 December the chamber collects
 * renewals for `year + 1`, any earlier month only catches stragglers of the
 * year already running. The boundary instant itself is UTC midnight,
 * deliberately: Membership Expiry instants are stamped with UTC setters, so
 * a Bangkok end-of-year boundary would miss every row by seven hours.
 * See ADR-0027 §2.
 */
export function computeRenewalSeasonBoundary(now: Date): Date {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "numeric" }).formatToParts(now)
	const year = Number(parts.find((part) => part.type === "year")?.value)
	const month = Number(parts.find((part) => part.type === "month")?.value)

	const seasonYear = month === 12 ? year + 1 : year
	return new Date(Date.UTC(seasonYear, 0, 1))
}
