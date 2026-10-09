import { integer, maxValue, minValue, object, optional, pipe, string, transform, type InferOutput } from "valibot"

/**
 * Structural request schema for GET /api/v1/business/search (#68) — the
 * live-business prefix-search picker for the backoffice.
 *
 * Validates TYPES and RANGES only. Next.js `searchParams` arrive as strings,
 * so every numeric field is `string() → transform(Number) → integer()`.
 *
 * Semantic rules live in the route handler, not here:
 *   - `search` is a raw string; the route trims and treats empty as
 *     "no filter" (null).
 *
 * Defaults (applied in the route after parse, NOT in the schema, so that an
 * absent value is distinguishable from a present one):
 *   - limit absent → 10
 *
 * Out-of-range or non-integer limit fails validation → 400.
 */

// limit: 1..50 integer. Default 10 applied in the route when absent.
const LimitSchema = optional(
	pipe(
		string(),
		transform((v) => Number(v)),
		integer(),
		minValue(1, "limit must be at least 1"),
		maxValue(50, "limit must be at most 50")
	)
)

// search: raw string. Trim + empty→null in the route.
const SearchSchema = optional(string())

export const BusinessSearchQuerySchema = object({
	limit: LimitSchema,
	search: SearchSchema,
})

export type BusinessSearchQueryOutput = InferOutput<typeof BusinessSearchQuerySchema>
