/**
 * Input/output types for {@link MemberFileUrlService} (ADR-0007).
 *
 * These names are the **response** field names (the GET detail surface), NOT the
 * upload field names. The response ships suffixless URL fields (grilling Q10):
 * `company_certificate`, `id_card_image`, `profile_avatar`, business `logo`,
 * business `product`. Each is a resolved URL (or null).
 */

/** Raw stored object keys for the five file-bearing fields, nullable. */
export interface MemberFilePaths {
	readonly idCardImage: string | null
	readonly companyCertificate: string | null
	readonly profileAvatar: string | null
	readonly logo: string | null
	readonly product: string | null
}

/** Resolved URLs (or null) for the same five fields. */
export interface MemberFileUrls {
	readonly idCardImage: string | null
	readonly companyCertificate: string | null
	readonly profileAvatar: string | null
	readonly logo: string | null
	readonly product: string | null
}
