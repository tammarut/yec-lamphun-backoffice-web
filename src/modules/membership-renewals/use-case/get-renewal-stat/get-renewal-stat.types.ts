/**
 * Types for the GET /api/v1/membership/renewals/stat endpoint — the Renewal
 * Stat, the three badge counts shown above the renewal-review table.
 *
 * Two layers only (the simplest read in the module — no filter, no cursor, no
 * page envelope):
 *   1. The repository's raw row shape (`RenewalStatRow`, camelCase, already
 *      number-typed by the `::int` casts in the sqlc query).
 *   2. The wire response DTO (`RenewalStatResponse`, snake_case — the API
 *      contract).
 *
 * The counts come from ONE aggregated query over the members table and read
 * ONLY the Renewal Cache Columns — membership_renewals is never joined (the
 * lists, by contrast, verify a live renewal row via `mr_latest.id IS NOT
 * NULL`). The three counts are NOT a partition: a member may appear in more
 * than one (e.g. Member Status EXPIRED again while its latest renewal is still
 * APPROVED) — consistent with how the two list tabs already overlap.
 *
 * Spec decisions locked during grilling
 * (openapi-spec/get_total_count_membership_renewal.openapi.json):
 *   - `total_expired_members` follows the spec's pseudocode LITERALLY —
 *     `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'` — a
 *     deliberate superset of the Expired Membership List (which keys on
 *     `status = 'EXPIRED'` alone). See ADR-0017.
 */

// --- Repository row shape ---------------------------------------------------

/** Raw DB row, already mapped to camelCase by sqlc (`::int` → JS number). */
export type RenewalStatRow = {
	readonly totalExpiredMembers: number
	readonly totalPendingReviewMembers: number
	readonly totalApprovedMembers: number
}

// --- Wire response DTO (API contract, snake_case) ---------------------------

export type RenewalStatResponse = {
	readonly total_expired_members: number
	readonly total_pending_review_members: number
	readonly total_approved_members: number
}
