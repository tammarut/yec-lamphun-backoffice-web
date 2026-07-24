/**
 * Types for the GET /api/v1/members list endpoint.
 *
 * Three layers:
 *   1. Wire response DTOs (snake_case — the API contract).
 *   2. The internal `ListMembersFilter` (camelCase) the service consumes.
 *   3. The repository's raw row + page shapes (`MemberListRow`, `MemberListPage`).
 *
 * Literal unions (`MemberStatus`, `SortField`, `SortOrder`) are the single
 * source of truth — the route's Valibot picklists use the same literals, so a
 * change here would surface as a tsc error there.
 */

// --- Literal unions (shared with the route schema) -------------------------

export type MemberStatus = "ACTIVE" | "EXPIRED" | "PENDING_RENEWAL" | "RESIGNED"

/** Sortable fields. Must match the columns used in the keyset predicate. */
export type SortField = "created_at" | "first_name_th" | "expires_at"

export type SortOrder = "asc" | "desc"

// --- Internal filter (service input) --------------------------------------

export type ListMembersFilter = {
	/** 1..50. Already defaulted by the route when absent. */
	readonly limit: number
	/** Null = first page. Otherwise a positive member id. */
	readonly cursor: number | null
	/** Null = no status filter. Otherwise non-empty array of statuses. */
	readonly statuses: readonly MemberStatus[] | null
	/** Null = no search filter. Otherwise a non-empty trimmed string. */
	readonly search: string | null
	readonly sortBy: SortField
	readonly sortOrder: SortOrder
}

// --- Repository row + page shapes -----------------------------------------

/**
 * Raw DB row, already mapped to camelCase by the repository. `profileAvatar`
 * is a stored R2 object key (or null); the service resolves it to a URL via
 * `MemberFileUrlService.resolveProfileAvatarUrl`. `positionCode` is shipped
 * verbatim as the response `position` (grilling Q4 — frontend maps to display
 * name; no positions JOIN).
 */
export type MemberListRow = {
	readonly id: number
	readonly registrationType: "INDIVIDUAL" | "JURISTIC_PERSON"
	readonly titleNameTh: string
	readonly firstNameTh: string
	readonly lastNameTh: string
	readonly nickname: string
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly positionCode: string
	readonly status: MemberStatus
	readonly profileAvatar: string | null
	readonly businessName: string
	readonly businessDescription: string
}

/**
 * Repository return shape. `hasMore` and `nextCursor` are computed here via
 * the `LIMIT n+1` trick (ADR-0011) so the `n+1` logic lives next to the SQL
 * that produced it; the service stays pure mapping + URL resolution.
 */
export type MemberListPage = {
	readonly rows: readonly MemberListRow[]
	readonly hasMore: boolean
	/** The id of the next anchor, or null when `hasMore` is false. */
	readonly nextCursor: number | null
}

// --- Wire response DTOs (API contract, snake_case) ------------------------

export type MemberListItemBusinessResponse = {
	readonly name: string
	readonly description: string
}

export type MemberListItemResponse = {
	readonly id: number
	/** Public-bucket URL (concatenated), or null when no avatar was uploaded. */
	readonly profile_avatar: string | null
	readonly registration_type: "INDIVIDUAL" | "JURISTIC_PERSON"
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly phone_no: string
	readonly email: string | null
	readonly line_id: string | null
	/** Raw position code; frontend maps to a Thai display name (grilling Q4). */
	readonly position: string
	readonly status: MemberStatus
	readonly business: MemberListItemBusinessResponse
}

export type ListMembersPageResponse = {
	readonly data: readonly MemberListItemResponse[]
	readonly has_more: boolean
	/** Stringified member id, or null when `has_more` is false. */
	readonly next_cursor: string | null
}
