import { integer, minValue, minLength, number, object, pipe, string, type InferOutput } from "valibot"

/**
 * Structural request schema for POST /api/v1/membership/renewals.
 *
 * Validates TYPES, REQUIRED-ness, and basic bounds only — the same depth as the
 * create-member schema for its file-path / integer fields. Semantic rules (the
 * member actually existing, its status allowing a renewal) live in the service.
 *
 * - `member_id`: a positive integer. JSON sends numbers natively, so (unlike a
 *   path param) no string→Number transform is needed — mirrors `category_id` in
 *   the create-member schema (`pipe(number(), integer(), check(n > 0))`).
 * - `payment_slip`: a non-empty string. It is an opaque R2 file-path token
 *   returned by POST /api/v1/members/file/upload — trusted as-is, same stance
 *   as `id_card_image` / `company_certificate` in create-member (grilling Q6).
 */
export const CreateRenewalSchema = object({
	member_id: pipe(number(), integer(), minValue(1, "member_id must be a positive integer")),
	payment_slip: pipe(string(), minLength(1, "payment_slip is required")),
})

export type CreateRenewalSchemaOutput = InferOutput<typeof CreateRenewalSchema>
