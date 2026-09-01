import { integer, maxValue, minValue, object, optional, pipe, string, transform, type InferOutput } from "valibot"

/**
 * Structural request schema for GET /api/v1/dashboard/stat
 * (query string).
 *
 * Validates TYPES and RANGES only. Next.js `searchParams` arrive as strings, so
 * the numeric field is `string() → transform(Number) → integer()`.
 *
 * Defaults (applied in the route after parse, NOT in the schema, so that an
 * absent value is distinguishable from a present one):
 *   - lookback_years absent → 5
 *
 * Every step carries the same message — the spec description's literal
 * wording — so `0`, `21`, `3.5`, and a non-numeric value (→ NaN, fails
 * `integer()`) all yield the identical 400 body. The 1..20 bounds are the
 * spec's own validation (`lookback_years < 1 or > 20` → 400).
 */
const LOOKBACK_YEARS_MESSAGE = "lookback_years must be between 1 and 20"

// lookback_years: 1..20 integer. Default 5 applied in the route when absent.
const LookbackYearsSchema = optional(
	pipe(
		string(),
		transform((v) => Number(v)),
		integer(LOOKBACK_YEARS_MESSAGE),
		minValue(1, LOOKBACK_YEARS_MESSAGE),
		maxValue(20, LOOKBACK_YEARS_MESSAGE)
	)
)

export const GetDashboardStatQuerySchema = object({
	lookback_years: LookbackYearsSchema,
})

export type GetDashboardStatQueryOutput = InferOutput<typeof GetDashboardStatQuerySchema>
