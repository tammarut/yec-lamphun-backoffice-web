/**
 * Types for the GET /api/v1/dashboard/stat endpoint — the Dashboard Stat, the
 * five headline counts of the backoffice dashboard.
 *
 * Two layers (the module's only read — no filter, no cursor, no page
 * envelope):
 *   1. The repository's raw row shapes (camelCase, already number-typed by
 *      the `::int` casts in the sqlc queries).
 *   2. The wire response DTO (`DashboardStatResponse`, snake_case — the API
 *      contract).
 *
 * Spec decisions locked during grilling
 * (openapi-spec/get_total_count_dashboard.openapi.json; see ADR-0019):
 *   - `total_expired_members` follows the dashboard spec LITERALLY —
 *     `status IN ('EXPIRED', 'PENDING_RENEWAL')`, the "not yet renewed"
 *     reading. This is DELIBERATELY a different definition from the Renewal
 *     Stat's same-named field (`status = 'EXPIRED' OR latest_renewal_status =
 *     'REJECTED'`, ADR-0017); the two endpoints' numbers are not expected to
 *     match. Disambiguated in CONTEXT.md under Dashboard Stat.
 *   - RESIGNED members count toward `total_members` and the yearly breakdown
 *     but neither status bucket — the three member counts do not sum.
 *   - Years in `total_members_each_year` are Bangkok wall-clock years
 *     (Asia/Bangkok), not session-timezone years.
 */

// --- Repository row shapes ---------------------------------------------------

/** Raw single-row aggregate of the three member-status headline counts. */
export type DashboardMemberStatusCountsRow = {
	readonly totalMembers: number
	readonly totalActiveMembers: number
	readonly totalExpiredMembers: number
}

/** Raw per-year row of the members-joined breakdown (Bangkok calendar years). */
export type MemberCountByYearRow = {
	readonly year: number
	readonly count: number
}

// --- Wire response DTO (API contract, snake_case) ----------------------------

/**
 * `total_members_each_year` maps a Bangkok calendar year (as a string key) to
 * the number of non-deleted members whose `member_since` falls in that year.
 * The service zero-fills the whole [current year - lookback + 1, current year]
 * window, so absent years appear as 0. (JS serializes integer-like keys in
 * ascending order regardless of insertion order — descending key order, as the
 * spec pseudocode fills it, is not representable in a JSON object.)
 */
export type DashboardStatResponse = {
	readonly total_members: number
	readonly total_active_members: number
	readonly total_expired_members: number
	readonly total_businesses: number
	readonly total_members_each_year: Readonly<Record<string, number>>
}
