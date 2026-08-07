import { AppError, DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Renewals-local error vocabulary for the create-renewal flow.
 *
 * Each class is a distinct HTTP outcome the route branches on by `instanceof`.
 * These live in the membership-renewals module (which produces them) rather than
 * the members module: AGENTS.md §1 forbids the renewals module from importing the
 * members module's own MemberNotFoundError, and the route (in src/app/api, above
 * both modules) imports these from here. There is a same-named class in the
 * members module — that is intentional; they model different facts (grilling Q4).
 */
export class MemberNotFoundError extends AppError {
	constructor(message = "not found this member id", cause?: unknown) {
		super(message, "MEMBER_NOT_FOUND_ERROR", cause)
	}
}

/**
 * Raised when the target member's status is RESIGNED — a resigned member cannot
 * file a renewal request. Maps to HTTP 403.
 */
export class ResignedMemberError extends AppError {
	constructor(message = "resigned members cannot submit renewal requests", cause?: unknown) {
		super(message, "RESIGNED_MEMBER_ERROR", cause)
	}
}

/**
 * Raised when the member already has a PENDING_REVIEW renewal — detected either
 * by the service's status pre-check (members.status = 'PENDING_RENEWAL') or by
 * the repository catching Postgres code 23505 from the partial unique index
 * idx_one_pending_renewal_per_member under a race. Both paths share this one
 * class and one message: the two detection mechanisms represent the same domain
 * fact, and the client cannot and should not care which fired (grilling Q3).
 * Maps to HTTP 409.
 */
export class PendingRenewalExistsError extends AppError {
	constructor(message = "You already have a pending renewal request", cause?: unknown) {
		super(message, "PENDING_RENEWAL_EXISTS_ERROR", cause)
	}
}

/**
 * Union of all errors a create-renewal flow can return. The route's mapError
 * branches on instanceof to pick the right status code:
 *   - MemberNotFoundError      → 404
 *   - ResignedMemberError      → 403
 *   - PendingRenewalExistsError → 409
 *   - DatabaseError            → 500
 */
export type CreateRenewalError = MemberNotFoundError | ResignedMemberError | PendingRenewalExistsError | DatabaseError
