/**
 * Wire types for the members list UI — mirrors the snake_case JSON contract of
 * `GET /api/v1/members` exactly (source: `get-list-members.types.ts` response
 * mapping). Field names here must never drift from the API.
 */

export type MemberStatus = "ACTIVE" | "EXPIRED" | "PENDING_RENEWAL" | "RESIGNED"

export type MemberListItem = {
	id: number
	/** Public-bucket display URL; null when the member has no avatar. */
	profile_avatar: string | null
	registration_type: "INDIVIDUAL" | "JURISTIC_PERSON"
	title_name_th: string
	first_name_th: string
	last_name_th: string
	nickname: string
	phone_no: string
	email: string | null
	line_id: string | null
	/** Raw position code (e.g. `GENERAL_MEMBER`) — render via `positionLabel`. */
	position: string
	status: MemberStatus
	business: {
		name: string
		description: string
	}
}

/** One cursor page of the keyset-paginated list (ADR-0011). */
export type ListMembersPage = {
	data: MemberListItem[]
	has_more: boolean
	next_cursor: string | null
}
