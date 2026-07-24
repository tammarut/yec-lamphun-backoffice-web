import { AppError, DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Raised when a cursor points at a member id that no longer exists (soft- or
 * hard-deleted between the client's page N and page N+1). The anchor row's
 * sort-field value is needed to build the `(sort_field, id)` keyset predicate
 * (ADR-0011); without it, continuing is impossible. Maps to 400 — the boundary
 * the client holds is stale, and it must restart from page 1.
 *
 * This is distinct from a *structurally* invalid cursor (non-numeric, zero,
 * negative), which is rejected by the Valibot schema at parse time before any
 * DB lookup runs.
 */
export class InvalidCursorError extends AppError {
	constructor(message = "Invalid cursor", cause?: unknown) {
		super(message, "INVALID_CURSOR", cause)
	}
}

/**
 * Union of all errors a get-list-members flow can return. The route's
 * `mapError` branches on instanceof:
 *   - `InvalidCursorError` → 400 + `warn` log (recoverable, client-visible).
 *   - `DatabaseError`      → 500 + `error` log (infra fault).
 */
export type GetListMembersError = InvalidCursorError | DatabaseError
