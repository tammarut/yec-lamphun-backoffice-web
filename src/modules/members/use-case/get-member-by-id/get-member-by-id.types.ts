/**
 * Wire-shape response DTOs for GET /api/v1/members/:id.
 *
 * Snake_case (the API contract), with `id_card_no: string | null` per ADR-0008
 * (nullable on decrypt failure) and `position: string` holding the raw position
 * CODE (grilling Q8 — the frontend maps it to a Thai display name). Business
 * file fields are the suffixless `logo` / `product` (grilling Q10) and carry
 * URLs, not file paths.
 */

export interface MemberBusinessResponse {
	readonly id: number
	readonly name: string
	readonly description: string
	readonly juristic_registration_no: string
	readonly category_id: number
	readonly address: string | null
	/** [longitude, latitude] in storage order; no swap on read. */
	readonly location: readonly [number, number] | null
	readonly core_business: string | null
	readonly website: string | null
	/** Public-bucket URL (concatenated), or null. */
	readonly logo: string | null
	/** Public-bucket URL (concatenated), or null. */
	readonly product: string | null
	readonly created_at: string
	readonly updated_at: string
}

export interface MemberDetailResponse {
	readonly id: number
	readonly registration_type: "INDIVIDUAL" | "JURISTIC_PERSON"
	/** Private-bucket presigned URL, or null. */
	readonly company_certificate: string | null
	/** Private-bucket presigned URL, or null. */
	readonly id_card_image: string | null
	/** Public-bucket URL (concatenated), or null. */
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly title_name_en: string | null
	readonly first_name_en: string | null
	readonly last_name_en: string | null
	readonly nickname: string
	readonly gender: "MALE" | "FEMALE" | "OTHER"
	/** ISO date (YYYY-MM-DD). */
	readonly date_of_birth: string
	readonly nationality: string
	/** Masked form (e.g. 632XXXXXX1483), or null on decrypt failure (ADR-0008). */
	readonly id_card_no: string | null
	/** ISO date (YYYY-MM-DD). */
	readonly id_card_expiry_date: string
	/** ISO datetime. */
	readonly member_since: string
	/** ISO datetime; null if the member has no expiry. */
	readonly expires_at: string | null
	readonly phone_no: string
	readonly email: string | null
	readonly line_id: string | null
	readonly shirt_size: string | null
	/** Raw position code (e.g. GENERAL_MEMBER); frontend maps to display name. */
	readonly position: string
	readonly status: "ACTIVE" | "EXPIRED" | "PENDING_RENEWAL" | "RESIGNED"
	readonly created_at: string
	readonly updated_at: string
	readonly business: MemberBusinessResponse
}
