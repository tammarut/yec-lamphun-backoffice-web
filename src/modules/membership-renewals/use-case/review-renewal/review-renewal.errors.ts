import { AppError, DatabaseError } from "src/shared/core/errors/app-error"

/**
 * Error vocabulary for the review-renewal flow (ADR-0018).
 *
 * Each class is a distinct HTTP outcome the route branches on by `instanceof`.
 * `RenewalAlreadyReviewedError` is shared by TWO detection mechanisms that
 * represent the same domain fact — the service's pre-check (a status read
 * outside the transaction) and the repository's SQL guard on
 * `UpdateRenewalOnReview` (zero rows inside the transaction under a race) —
 * exactly how `PendingRenewalExistsError` spans the create flow's pre-check and
 * its 23505 catch. The client cannot and should not care which fired.
 */

/**
 * The target renewal does not exist or is soft-deleted (the two are
 * indistinguishable to the client). Maps to HTTP 404.
 */
export class RenewalNotFoundError extends AppError {
	constructor(message = "not found this renewal", cause?: unknown) {
		super(message, "RENEWAL_NOT_FOUND_ERROR", cause)
	}
}

/**
 * The renewal is not live for review — its Renewal Status is already terminal
 * (APPROVED or REJECTED, whether assigned at submission or by an earlier
 * review). Detected by the service pre-check or by the guarded UPDATE matching
 * zero rows under a concurrent review; both map to HTTP 409.
 */
export class RenewalAlreadyReviewedError extends AppError {
	constructor(message = "This renewal has been reviewed", cause?: unknown) {
		super(message, "RENEWAL_ALREADY_REVIEWED_ERROR", cause)
	}
}

/**
 * Union of all errors a review-renewal flow can return. The route's mapError
 * branches on instanceof to pick the right status code:
 *   - RenewalNotFoundError       → 404
 *   - RenewalAlreadyReviewedError → 409
 *   - DatabaseError              → 500
 */
export type ReviewRenewalError = RenewalNotFoundError | RenewalAlreadyReviewedError | DatabaseError
