import type { MemberFileFieldName } from "./member-file.constants"

/**
 * A file extracted from the multipart form, paired with its field name.
 * `file` is the Web API `File` from `FormData.get()`.
 */
export interface MemberFileRequest {
	readonly field: MemberFileFieldName
	readonly file: File
}

/**
 * The successful-upload response body. Every `*_file_path` key is always
 * present; uploaded fields get their R2 object key, the rest are `null`.
 * Matches the spec's `UploadSuccessResponse` schema (all six keys required).
 */
export interface UploadedFilePathResponse {
	readonly id_card_image_file_path: string | null
	readonly company_certificate_file_path: string | null
	readonly profile_avatar_file_path: string | null
	readonly business_logo_file_path: string | null
	readonly business_product_file_path: string | null
	readonly payment_slip_file_path: string | null
}
