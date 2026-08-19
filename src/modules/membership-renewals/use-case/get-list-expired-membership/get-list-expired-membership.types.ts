/**
 * Types for the GET /api/v1/membership/renewals/expired list endpoint.
 *
 * Three layers (mirroring get-list-members):
 *   1. Wire response DTOs (snake_case — the API contract).
 *   2. The internal `ListExpiredMembershipFilter` (camelCase) the service consumes.
 *   3. The repository's raw row + page shapes (`ExpiredMembershipListRow`,
 *      `ExpiredMembershipListPage`).
 *
 * The listing reads ONLY the members table: the rejected-first grouping keys off
 * the denormalized `latest_renewal_status` Renewal Cache Column, not the
 * membership_renewals table. `status` is the literal "EXPIRED" — the query
 * filters `status = 'EXPIRED'`, so no other value is reachable. Each row also
 * carries `latest_renewal_status` so the UI can badge rejected-renewal members;
 * ordering alone cannot mark where that group ends (originally rejected as
 * "order-only" in grilling Q3, reversed when the UI needed the label).
 */

import type { RenewalStatus } from "../../domain/membership-renewal"

// --- Internal filter (service input) --------------------------------------

export type ListExpiredMembershipFilter = {
	/** 1..100. Already defaulted by the route when absent. */
	readonly limit: number
	/** Null = first page. Otherwise a positive member id (the last row seen). */
	readonly cursor: number | null
	/** Null = no search filter. Otherwise a non-empty trimmed string. */
	readonly search: string | null
}

// --- Repository row + page shapes -----------------------------------------

/**
 * Raw DB row, already mapped to camelCase by the repository. `profileAvatar`
 * is a stored R2 object key (or null); the service resolves it to a public URL
 * via the shared `IStorageUrlResolver`. `positionCode` is shipped verbatim as
 * the response `position` (grilling Q4 — raw code, like GET /members; the
 * frontend maps to a display name). `memberSince` is the TIMESTAMPTZ as a Date;
 * the service serializes it to an ISO string for the wire.
 */
export type ExpiredMembershipListRow = {
	readonly id: number
	readonly profileAvatar: string | null
	readonly titleNameTh: string
	readonly firstNameTh: string
	readonly lastNameTh: string
	readonly nickname: string
	readonly phoneNo: string
	readonly positionCode: string
	readonly status: "EXPIRED"
	/**
	 * The Renewal Status of the member's most recent renewal, from the cache
	 * column — null when the member never filed one. Powers the UI's
	 * rejected-renewal badge (`=== "REJECTED"`).
	 */
	readonly latestRenewalStatus: RenewalStatus | null
	readonly memberSince: Date
}

/**
 * Repository return shape. `hasMore` and `nextCursor` are computed here via
 * the `LIMIT n+1` trick (ADR-0011) so the n+1 logic lives next to the SQL that
 * produced it; the service stays pure mapping + URL resolution.
 */
export type ExpiredMembershipListPage = {
	readonly rows: readonly ExpiredMembershipListRow[]
	readonly hasMore: boolean
	/** The id of the next anchor, or null when `hasMore` is false. */
	readonly nextCursor: number | null
}

// --- Wire response DTOs (API contract, snake_case) ------------------------

export type ExpiredMembershipResponse = {
	readonly id: number
	/** Public-bucket URL (concatenated), or null when no avatar was uploaded. */
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly phone_no: string
	/** Raw position code; frontend maps to a display name (grilling Q4). */
	readonly position: string
	readonly status: "EXPIRED"
	/**
	 * The Renewal Status of the member's most recent renewal ("REJECTED" |
	 * "APPROVED" | "PENDING_REVIEW"), or null when the member never filed a
	 * renewal. The UI badges rows where this is "REJECTED".
	 */
	readonly latest_renewal_status: RenewalStatus | null
	readonly member_since: string
}

export type ListExpiredMembershipPageResponse = {
	readonly data: readonly ExpiredMembershipResponse[]
	readonly has_more: boolean
	/** Stringified member id, or null when `has_more` is false. */
	readonly next_cursor: string | null
}
