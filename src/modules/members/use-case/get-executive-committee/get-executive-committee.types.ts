/**
 * Types for the get-executive-committee use case
 * (GET /api/v1/members/executive-committee) — ADR-0020.
 */

/**
 * Read model for one flat Executive Committee row: a live, non-RESIGNED member
 * holding any position except GENERAL_MEMBER, with their 1:1 business name.
 * DB-shaped, camelCase; `profileAvatar` is the stored R2 object key (resolved
 * to a public URL by MemberFileUrlService at the service layer) and
 * `businessName` is null when no live business row exists.
 */
export interface ExecutiveCommitteeMemberRow {
	readonly id: number
	readonly profileAvatar: string | null
	readonly titleNameTh: string
	readonly firstNameTh: string
	readonly lastNameTh: string
	readonly nickname: string
	readonly positionCode: string
	readonly businessName: string | null
}

/**
 * One wire node of the org-chart tree. A member node carries the member's
 * identity; a **Vacant Position placeholder** node (ADR-0020) marks a position
 * with live descendants but no live holder — it is recognizable by
 * `id === null` and carries only the `position` title.
 *
 * `id`, the name fields, and `business_name` are nullable precisely because
 * placeholders exist; `position` is always the Thai display name from
 * `positions.name_th` (never the code).
 */
export interface ExecutiveCommitteeNode {
	/** Member id, or null on a Vacant Position placeholder. */
	readonly id: number | null
	/** Public File URL of the avatar (ADR-0007), or null. */
	readonly profile_avatar: string | null
	readonly title_name_th: string | null
	readonly first_name_th: string | null
	readonly last_name_th: string | null
	readonly nickname: string | null
	/** Thai display name from positions.name_th — always present. */
	readonly position: string
	readonly business_name: string | null
	readonly children: ExecutiveCommitteeNode[]
}

/**
 * The response: the President-rooted tree, or null when there is no live
 * PRESIDENT holder to root it (the placeholder rule deliberately does not
 * apply to the root — grilling decision).
 */
export type GetExecutiveCommitteeResponse = ExecutiveCommitteeNode | null
