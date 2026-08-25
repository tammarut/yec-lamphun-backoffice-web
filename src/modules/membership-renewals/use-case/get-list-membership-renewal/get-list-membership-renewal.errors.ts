import { AppError, DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Raised when a cursor's anchor member is no longer a valid resume point for
 * the requested status's set: the member was soft-/hard-deleted, has no
 * non-deleted renewal, or their `latest_renewal_status` no longer equals the
 * requested status (e.g. their renewal was approved between the client's page N
 * and page N+1 while paginating the PENDING_REVIEW tab). Maps to 400 — the
 * boundary the client holds is stale; it must restart from page 1.
 *
 * This is the hardened-anchor semantics the expired list adopted after 935aced
 * ("treat non-expired cursor anchors as invalid"): the anchor must still sit
 * INSIDE the filtered set, not merely exist. The spec's pseudocode only checked
 * that a renewal exists for the member_id — deliberately not copied. Same
 * class as the members and expired-list InvalidCursorErrors (ADR-0011),
 * re-declared per use case because use cases never import each other's
 * internals.
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
 * Union of all errors a get-list-membership-renewal flow can return. The
 * route's `mapListError` branches on instanceof:
 *   - `InvalidCursorError` → 400 + `warn` log (recoverable, client-visible).
 *   - `DatabaseError`      → 500 + `error` log (infra fault).
 */
export type GetListMembershipRenewalError = InvalidCursorError | DatabaseError
