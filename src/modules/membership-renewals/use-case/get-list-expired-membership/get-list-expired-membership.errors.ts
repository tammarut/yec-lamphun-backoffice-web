import { AppError, DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Raised when a cursor points at a member id that no longer exists (soft- or
 * hard-deleted between the client's page N and page N+1). The anchor row's
 * `latest_renewal_status` is needed to decide which ordering group the next
 * page resumes from (rejected-first); without it, continuing is impossible.
 * Maps to 400 — the boundary the client holds is stale; it must restart from
 * page 1. Same semantics as the members module's InvalidCursorError (ADR-0011),
 * re-declared here because modules never import each other's internals.
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
 * Union of all errors a get-list-expired-membership flow can return. The
 * route's `mapError` branches on instanceof:
 *   - `InvalidCursorError` → 400 + `warn` log (recoverable, client-visible).
 *   - `DatabaseError`      → 500 + `error` log (infra fault).
 */
export type GetListExpiredMembershipError = InvalidCursorError | DatabaseError
