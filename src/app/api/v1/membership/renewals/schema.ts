import { array, check, integer, minLength, maxLength, minValue, number, object, pipe, string, type InferOutput } from "valibot"

/**
 * Structural request schema for POST /api/v1/membership/renewals.
 *
 * Validates TYPES, REQUIRED-ness, and basic bounds only — the same depth as the
 * create-member schema for its file-path / integer fields. Semantic rules (the
 * members actually existing, their statuses allowing a renewal) live in the
 * service.
 *
 * - `member_ids`: the bulk contract (ADR-0026) — a non-empty array of at most 6
 *   UNIQUE positive integers, index 0 = main member. The old `member_id` field
 *   is GONE (breaking change): an old-shape body fails with "member_ids is
 *   required"-class validation errors. Uniqueness is a cross-item rule the item
 *   schema can't express, so it rides a `check` on the array.
 * - `payment_slip`: a non-empty string. It is an opaque R2 file-path token
 *   returned by POST /api/v1/members/file/upload — trusted as-is, same stance
 *   as `id_card_image` / `company_certificate` in create-member (grilling Q6).
 */
export const CreateRenewalSchema = object({
	member_ids: pipe(
		array(pipe(number(), integer(), minValue(1, "member_ids must contain positive integers"))),
		minLength(1, "member_ids must not be empty"),
		maxLength(6, "member_ids must contain at most 6 members"),
		check((ids) => new Set(ids).size === ids.length, "member_ids must be unique")
	),
	payment_slip: pipe(string(), minLength(1, "payment_slip is required")),
})

export type CreateRenewalSchemaOutput = InferOutput<typeof CreateRenewalSchema>
