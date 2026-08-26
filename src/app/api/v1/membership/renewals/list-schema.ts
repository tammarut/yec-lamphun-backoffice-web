import { integer, maxValue, minValue, object, optional, picklist, pipe, string, transform, type InferOutput } from "valibot"

/**
 * Structural request schema for GET /api/v1/membership/renewals
 * (query string).
 *
 * Validates TYPES and RANGES only. Next.js `searchParams` arrive as strings, so
 * every numeric field is `string() → transform(Number) → integer()`.
 *
 * Semantic rules live in the route handler, not here:
 *   - `search` is a raw string; the route trims and treats empty as "no filter".
 *
 * Defaults (applied in the route after parse, NOT in the schema, so that an
 * absent value is distinguishable from a present one):
 *   - limit absent → 10
 *
 * `status` is the one REQUIRED parameter — it selects which Renewal Status tab
 * of the review table the list serves; REJECTED is not a listable status (the
 * rejected members surface inside the Expired Membership List instead).
 *
 * Out-of-range limit and any non-integer cursor fail validation → 400. The
 * cursor is a string-encoded positive integer or absent; a well-formed cursor
 * whose anchor left the requested status's set is rejected downstream by the
 * repository (InvalidCursorError → 400), not here.
 *
 * Note the limit ceiling is 100 — this endpoint's spec allows more per page
 * than GET /members (50), so the constant here is intentionally different.
 */

// limit: 1..100 integer. Default 10 applied in the route when absent.
const LimitSchema = optional(
	pipe(
		string(),
		transform((v) => Number(v)),
		integer(),
		minValue(1, "limit must be at least 1"),
		maxValue(100, "limit must be at most 100")
	)
)

// cursor: positive integer encoded as a string, or absent.
const CursorSchema = optional(
	pipe(
		string(),
		transform((v) => Number(v)),
		integer(),
		minValue(1, "cursor must be a positive integer")
	)
)

// status: required, one of the two listable Renewal Statuses.
const StatusSchema = picklist(["PENDING_REVIEW", "APPROVED"], "status must be PENDING_REVIEW or APPROVED")

// search: raw string. Trim + empty→null in the route.
const SearchSchema = optional(string())

export const GetListMembershipRenewalQuerySchema = object({
	limit: LimitSchema,
	cursor: CursorSchema,
	status: StatusSchema,
	search: SearchSchema,
})

export type GetListMembershipRenewalQueryOutput = InferOutput<typeof GetListMembershipRenewalQuerySchema>
