/**
 * Membership Expiry rule (CONTEXT.md): the last instant of the NEXT calendar
 * year after `now` — `${now.getFullYear()+1}-12-31T23:59:59.999`. One rule,
 * applied at BOTH member creation (via `Member`) and manual renewal (via
 * `MembershipRenewal`).
 *
 * Lives in `src/modules/shared/` so neither feature module imports the other
 * (AGENTS.md §1 forbids members↔membership-renewals TS imports; §2A puts
 * cross-cutting shared contracts in `src/modules/shared/`). It is a pure
 * function — no DI token / container registration, matching how other plain
 * shared modules (e.g. `id-generator` is a class, but `crypto`/`storage`
 * interfaces live here as plain contracts) are organized.
 *
 * UTC setters are used deliberately so the resulting instant is unambiguous
 * regardless of the host timezone: the `+07:00` in the OpenAPI spec example is
 * only Postgres' display of the stored TIMESTAMPTZ, not a different value. The
 * year is added BEFORE zeroing month/day/time so a Dec 31 `now` still lands on
 * the *next* year's Dec 31 (not +365 days). See ADR-0016.
 *
 * This **supersedes** the previous member-creation formula (`now + 1 calendar
 * year, time set to end of that day`): creation now aligns the member to the
 * same calendar-year cycle a manual renewal uses.
 */
export function computeMembershipExpiry(now: Date): Date {
	const expiresAt = new Date(now)
	// Roll the year first, then pin month/day/time. setUTCMonth(11, 31) sets
	// December the 31st; safe because the year is already next year.
	expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1)
	expiresAt.setUTCMonth(11, 31) // December (0-indexed) the 31st
	expiresAt.setUTCHours(23, 59, 59, 999)
	return expiresAt
}
