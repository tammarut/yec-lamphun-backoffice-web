/**
 * Member file upload constants.
 *
 * See openapi-spec/post_upload_member_files_multipart.openapi.yaml and
 * docs/adr/0002-r2-two-bucket-public-private-split.md.
 */

/** Per-file size limit in bytes (7MB), matching the API spec in Apidog. */
export const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024

/** Allowed image extensions (lowercased, with leading dot). */
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number]

/** Maps each allowed extension to its MIME content type for R2 PutObject. */
export const EXTENSION_CONTENT_TYPE: Readonly<Record<AllowedExtension, string>> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
}

/** Which R2 bucket a field is stored in. */
export type { BucketKind } from "src/modules/shared/storage"
import type { BucketKind } from "src/modules/shared/storage"
import type { UploadedFilePathResponse } from "./member-file.types"

export const MEMBER_FILE_FIELDS = ["id_card_image", "company_certificate", "profile_avatar", "business_logo", "business_product", "payment_slip"] as const

export type MemberFileFieldName = (typeof MEMBER_FILE_FIELDS)[number]

/**
 * Fixed metadata for each accepted multipart field. Drives both validation,
 * object-key construction, and response-shape assembly.
 *
 * `keyPrefix` is the full R2 object-key prefix (incl. the `members/` namespace),
 * and `filePrefix` is the short filename stem used before the ULID — per the
 * spec's bucket table and 200 response examples (which use short prefixes:
 * company_cert_, logo_, product_), not the field name.
 */
type MemberFieldDefinition = {
	/** The multipart form field name, e.g. "id_card_image". */
	readonly field: MemberFileFieldName
	/** Bucket classification: "public" (display images) or "private" (sensitive docs). */
	readonly bucket: BucketKind
	/** Full R2 object-key prefix, e.g. "members/documents/". */
	readonly keyPrefix: string
	/** Short filename stem placed before the ULID, e.g. "company_cert". */
	readonly filePrefix: string
	/** The response-body key for this field's uploaded path, e.g. "company_certificate_file_path". */
	readonly responseKey: keyof UploadedFilePathResponse
}

/**
 * The single source of truth for field → (bucket, key, responseKey) mapping.
 * Order here is the order files are validated and uploaded in.
 */
export const FIELD_DEFINITIONS: Readonly<Record<MemberFileFieldName, MemberFieldDefinition>> = {
	id_card_image: {
		field: "id_card_image",
		bucket: "private",
		keyPrefix: "members/documents/",
		filePrefix: "id_card_image",
		responseKey: "id_card_image_file_path",
	},
	company_certificate: {
		field: "company_certificate",
		bucket: "private",
		keyPrefix: "members/documents/",
		filePrefix: "company_cert",
		responseKey: "company_certificate_file_path",
	},
	profile_avatar: {
		field: "profile_avatar",
		bucket: "public",
		keyPrefix: "members/profile_avatars/",
		filePrefix: "profile_avatar",
		responseKey: "profile_avatar_file_path",
	},
	business_logo: {
		field: "business_logo",
		bucket: "public",
		keyPrefix: "members/business/",
		filePrefix: "logo",
		responseKey: "business_logo_file_path",
	},
	business_product: {
		field: "business_product",
		bucket: "public",
		keyPrefix: "members/business/",
		filePrefix: "product",
		responseKey: "business_product_file_path",
	},
	payment_slip: {
		field: "payment_slip",
		bucket: "private",
		keyPrefix: "members/documents/",
		filePrefix: "payment_slip",
		responseKey: "payment_slip_file_path",
	},
}
