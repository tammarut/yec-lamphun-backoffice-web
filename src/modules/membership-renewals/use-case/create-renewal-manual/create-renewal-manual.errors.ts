import type { DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Error vocabulary for the manual create-renewal flow.
 *
 * The domain outcomes are IDENTICAL to the public create-renewal flow
 * (404 not-found / 403 resigned / 409 pending-renewal / 500 infra), so this
 * module re-exports the same error classes from the sibling use-case folder
 * rather than re-declaring them. Re-exporting within the SAME module
 * (`membership-renewals`) does NOT cross the AGENTS.md §1 module boundary.
 *
 * The one behavioral difference vs the public flow is NOT in the error set: the
 * manual repository write (INSERT of an `APPROVED` renewal) is excluded from
 * the partial unique index `idx_one_pending_renewal_per_member`, so it can
 * never raise Postgres 23505 — the only `PendingRenewalExistsError` on this
 * path comes from the service pre-check (`member.status === PENDING_RENEWAL`).
 */

// Re-export the class VALUES so the route can branch on `instanceof`.
export { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "../create-renewal/create-renewal.errors"

// Import the class names AS TYPES (instance types) for the union below.
import type { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "../create-renewal/create-renewal.errors"

/**
 * Union of all errors a manual create-renewal flow can return. Same shape as
 * the public CreateRenewalError; the route's mapError branches on instanceof to
 * pick the status code exactly as the public route does.
 */
export type CreateManualRenewalError = MemberNotFoundError | ResignedMemberError | PendingRenewalExistsError | DatabaseError
