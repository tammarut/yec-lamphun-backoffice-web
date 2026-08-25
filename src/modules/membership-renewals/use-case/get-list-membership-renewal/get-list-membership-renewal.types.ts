/**
 * Types for the GET /api/v1/membership/renewals list endpoint.
 *
 * Three layers (mirroring get-list-expired-membership):
 *   1. Wire response DTOs (snake_case — the API contract).
 *   2. The internal `ListMembershipRenewalFilter` (camelCase) the service consumes.
 *   3. The repository's raw row + page shapes (`MembershipRenewalListRow`,
 *      `MembershipRenewalListPage`).
 *
 * Unlike the Expired Membership List (a members-table-only read), this list JOINS
 * `membership_renewals` via LATERAL to surface each member's most recent renewal:
 * its `renewal_id` (so the review workflow can act on the renewal) and its
 * `payment_date_at` (the list's sort key). The status filter itself keys off the
 * `latest_renewal_status` Renewal Cache Column — the join only enriches rows,
 * it never decides membership in the list.
 *
 * Spec deviations locked during grilling (openapi-spec/get_list_membership_renewal.openapi.json):
 *   - `renewal_id` IS exposed even though the formal schema omits it (the
 *     pseudocode includes it; the pending-review tab needs it to act on a row).
 *   - `position` ships the raw position CODE (like the expired list and
 *     GET /members); the spec's POSITION_MAP/Thai-name rendering is rejected.
 *   - The spec's `m.position` column does not exist — the real column is
 *     `position_code`.
 */

import type { RenewalStatus } from "../../domain/membership-renewal"

// --- Internal filter (service input) --------------------------------------

/** The Renewal Statuses the list can be filtered to. REJECTED is not listable. */
export type ListableRenewalStatus = Extract<RenewalStatus, "PENDING_REVIEW" | "APPROVED">

export type ListMembershipRenewalFilter = {
	/** 1..100. Already defaulted by the route when absent. */
	readonly limit: number
	/** Null = first page. Otherwise a positive member id (the last row seen). */
	readonly cursor: number | null
	/** Required filter — which Renewal Status tab of the review table is shown. */
	readonly status: ListableRenewalStatus
	/** Null = no search filter. Otherwise a non-empty trimmed string. */
	readonly search: string | null
}

// --- Repository row + page shapes -----------------------------------------

/**
 * Raw DB row, already mapped to camelCase by the repository. `profileAvatar`
 * is a stored R2 object key (or null); the service resolves it to a public URL
 * via the shared `IStorageUrlResolver`. `positionCode` is shipped verbatim as
 * the response `position` (the frontend maps to a display name — same
 * convention as the expired list and GET /members). `renewalId` is the id of
 * the member's most recent non-deleted renewal. `memberSince` and
 * `paymentDateAt` are TIMESTAMPTZ Dates; the service serializes them to ISO
 * strings for the wire.
 */
export type MembershipRenewalListRow = {
	readonly id: number
	readonly renewalId: number
	readonly profileAvatar: string | null
	readonly titleNameTh: string
	readonly firstNameTh: string
	readonly lastNameTh: string
	readonly nickname: string
	readonly phoneNo: string
	readonly positionCode: string
	readonly status: ListableRenewalStatus
	readonly memberSince: Date
	readonly paymentDateAt: Date
}

/**
 * Repository return shape. `hasMore` and `nextCursor` are computed here via
 * the `LIMIT n+1` trick (ADR-0011) so the n+1 logic lives next to the SQL that
 * produced it; the service stays pure mapping + URL resolution.
 */
export type MembershipRenewalListPage = {
	readonly rows: readonly MembershipRenewalListRow[]
	readonly hasMore: boolean
	/** The member id of the next anchor, or null when `hasMore` is false. */
	readonly nextCursor: number | null
}

// --- Wire response DTOs (API contract, snake_case) ------------------------

export type MembershipRenewalResponse = {
	readonly id: number
	/** The id of the member's most recent renewal — the review workflow's target. */
	readonly renewal_id: number
	/** Public-bucket URL (concatenated), or null when no avatar was uploaded. */
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly phone_no: string
	/** Raw position code; frontend maps to a display name. */
	readonly position: string
	/** The Renewal Status of the member's most recent renewal (= the filter). */
	readonly status: ListableRenewalStatus
	readonly member_since: string
	readonly payment_date_at: string
}

export type ListMembershipRenewalPageResponse = {
	readonly data: readonly MembershipRenewalResponse[]
	readonly has_more: boolean
	/** Stringified member id, or null when `has_more` is false. */
	readonly next_cursor: string | null
}
