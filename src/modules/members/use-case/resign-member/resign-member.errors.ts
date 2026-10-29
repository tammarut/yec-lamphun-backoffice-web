import { AppError } from "src/shared/core/errors/app-error"
import type { DatabaseError } from "src/shared/core/errors/app-error"

// Re-export the class VALUE so the route can branch on `instanceof` — the
// resign flow reuses the get-member-by-id 404 verbatim (a missing id and a
// soft-deleted id are indistinguishable, same as every member read).
export { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"
import type { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"

/**
 * Raised when the resign command's target is not currently EXPIRED (#113) —
 * the one 409 of the flow, covering BOTH rejection sites with deliberately
 * ONE message:
 *   - the service pre-check read a live member whose status is ACTIVE /
 *     PENDING_RENEWAL / RESIGNED, or
 *   - the guarded UPDATE matched 0 rows — the member's status changed between
 *     the pre-check and the write (the lost race).
 * EXPIRED is the only transitionable source status; RESIGNED is terminal
 * (there is deliberately no un-resign path). Maps to HTTP 409.
 */
export class MemberNotExpiredError extends AppError {
	/**
	 * The single message every MemberNotExpiredError carries — the route and
	 * the tests pin it, so the client sees one stable 409 body regardless of
	 * which non-EXPIRED status (or race) triggered the rejection.
	 */
	static readonly DEFAULT_MESSAGE = "member is not expired — only an EXPIRED member can be resigned"

	constructor(message: string = MemberNotExpiredError.DEFAULT_MESSAGE, cause?: unknown) {
		super(message, "MEMBER_NOT_EXPIRED_ERROR", cause)
	}
}

/**
 * Union of all errors a resign-member flow can return. The route's mapError
 * branches on instanceof to pick the status code: 404 not-found, 409
 * not-expired, DatabaseError → 500.
 */
export type ResignMemberError = MemberNotFoundError | MemberNotExpiredError | DatabaseError
