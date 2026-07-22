import { integer, maxValue, minValue, object, optional, picklist, pipe, string, transform, type InferOutput } from "valibot"

/**
 * Structural request schema for GET /api/v1/members (query string).
 *
 * Validates TYPES, ENUMS, and RANGES only. Next.js `searchParams` arrive as
 * strings, so every numeric field is `string() → transform(Number) → integer()`.
 *
 * Semantic rules live in the route handler, not here:
 *   - `status` is a raw CSV string ("ACTIVE,EXPIRED"); the route splits, trims,
 *     drops empties, and validates each token against the status enum. An
 *     all-empty / absent status means "no filter" (grilling Q2 / Q10-c).
 *   - `search` is a raw string; the route trims and treats empty as "no filter".
 *
 * Defaults (applied in the route after parse, NOT in the schema, so that an
 * absent value is distinguishable from a present one):
 *   - limit absent → 10
 *   - sort_by absent → "created_at"
 *   - sort_order absent → "desc"
 *
 * Out-of-range limit (Q10-a) and any non-enum value fail validation → 400.
 * The cursor is a string-encoded positive integer or absent (Q10-b / Q3); a
 * well-formed cursor whose anchor row was deleted is rejected downstream by
 * the repository (InvalidCursorError → 400), not here.
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

// cursor: positive integer encoded as a string, or absent.
const CursorSchema = optional(
	pipe(
		string(),
		transform((v) => Number(v)),
		integer(),
		minValue(1, "cursor must be a positive integer")
	)
)

// status: raw CSV string ("ACTIVE,EXPIRED"). Split + per-token enum validation
// happens in the route — see file header. Absent or empty → no filter.
const StatusSchema = optional(string())

// search: raw string. Trim + empty→null in the route.
const SearchSchema = optional(string())

export const SortBySchema = picklist(["created_at", "first_name_th", "expires_at"])
export const SortOrderSchema = picklist(["asc", "desc"])

export const GetListMembersQuerySchema = object({
	limit: LimitSchema,
	cursor: CursorSchema,
	status: StatusSchema,
	search: SearchSchema,
	sort_by: optional(SortBySchema),
	sort_order: optional(SortOrderSchema),
})

export type GetListMembersQueryOutput = InferOutput<typeof GetListMembersQuerySchema>
