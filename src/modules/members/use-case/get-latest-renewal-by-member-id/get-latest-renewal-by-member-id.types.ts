/**
 * Wire-shape response DTOs for GET /api/v1/membership/renewals/:member_id.
 *
 * Snake_case (the API contract), matching the SingleRenewalResponse schema. The
 * top-level `id` is the MEMBER id; `renewal.id` is the renewal id. `position`
 * holds the raw position CODE (the frontend maps it to a Thai display name —
 * same convention as members/:id). `profile_avatar` is a public-bucket URL (or
 * null); `renewal.payment_slip` is a private-bucket presigned URL (ADR-0007);
 * `renewal.payment_date_at` is a full ISO datetime (the column is TIMESTAMPTZ).
 */

export interface LatestRenewalBusinessResponse {
	readonly name: string
}

export interface LatestRenewalRenewalResponse {
	readonly id: number
	/** ISO datetime (TIMESTAMPTZ → toISOString()). */
	readonly payment_date_at: string
	/** Private-bucket presigned URL. */
	readonly payment_slip: string
}

export interface LatestRenewalResponse {
	readonly id: number
	/** Public-bucket URL (concatenated), or null if the member has no avatar. */
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly phone_no: string
	/** Raw position code (e.g. GENERAL_MEMBER); frontend maps to display name. */
	readonly position: string
	readonly business: LatestRenewalBusinessResponse
	readonly renewal: LatestRenewalRenewalResponse
}
