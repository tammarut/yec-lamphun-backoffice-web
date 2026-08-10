import { integer, minValue, minLength, number, object, pipe, string, type InferOutput } from "valibot"

/**
 * Structural request schema for POST /api/v1/membership/renewals/manual.
 *
 * Field-identical to the public CreateRenewalSchema today, but defined LOCALLY
 * (not imported) so the two routes evolve independently: a future manual-only
 * field (e.g. an explicit payment date override) would not leak into the public
 * route's validation. Same depth as the public schema — TYPES, REQUIRED-ness,
 * and basic bounds only; semantic rules (member exists, status eligible) live
 * in the service.
 *
 * - `member_id`: a positive integer (JSON sends numbers natively).
 * - `payment_slip`: a non-empty opaque R2 file-path token from
 *   POST /api/v1/members/file/upload, trusted as-is.
 */
export const CreateManualRenewalSchema = object({
	member_id: pipe(number(), integer(), minValue(1, "member_id must be a positive integer")),
	payment_slip: pipe(string(), minLength(1, "payment_slip is required")),
})

export type CreateManualRenewalSchemaOutput = InferOutput<typeof CreateManualRenewalSchema>
