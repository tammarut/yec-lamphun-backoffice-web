/**
 * Types for the GET /api/v1/business search endpoint (#68): the prefix-search
 * picker over LIVE businesses (soft-deleted rows never surface).
 *
 * `BusinessSearchFilter` is the internal filter the service consumes;
 * `BusinessSearchItem` is the repository's mapped row shape (camelCase). The
 * wire response DTO (snake_case) lives with the HTTP route, which is built
 * separately.
 */

// --- Internal filter (service input) ---------------------------------------

export type BusinessSearchFilter = {
	/** 1..50. Already defaulted by the route when absent. */
	readonly limit: number
	/** Null = no search filter (every live business, up to the limit). */
	readonly search: string | null
}

// --- Repository row shape ----------------------------------------------------

/**
 * One live business with its live-member rollup, already mapped to camelCase
 * by {@link BusinessSearchRepository}. `memberCount` counts LIVE linked
 * members only (ADR-0023: a business exists while its last live link does);
 * `ownerNames` is the Thai full names of those members in member-id order,
 * always an array (empty when the business has no live linked members —
 * possible while an in-flight create transaction links its first member).
 * `address` is nullable in the businesses schema.
 */
export type BusinessSearchItem = {
	readonly id: number
	readonly name: string
	readonly juristicRegistrationNo: string
	readonly categoryName: string
	readonly address: string | null
	readonly memberCount: number
	readonly ownerNames: readonly string[]
}
