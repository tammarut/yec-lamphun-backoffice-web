import { AppError } from "src/shared/core/errors/app-error"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { StorageError } from "src/modules/shared/storage"

/**
 * Raised when the member (or its 1:1 business) does not exist or is soft-deleted
 * — the composite query returned 0 rows. Maps to 404 with message
 * "Member or renewal not found".
 */
export class MemberOrRenewalNotFoundError extends AppError {
	constructor(cause?: unknown) {
		super("Member or renewal not found", "MEMBER_OR_RENEWAL_NOT_FOUND_ERROR", cause)
	}
}

/**
 * Raised when the member exists but has no live renewal rows (the LEFT LATERAL
 * yielded NULL renewal columns). Maps to 404 with message
 * "No renewal records found" — a distinct case from
 * {@link MemberOrRenewalNotFoundError}, per the spec.
 */
export class RenewalNotFoundError extends AppError {
	constructor(cause?: unknown) {
		super("No renewal records found", "RENEWAL_NOT_FOUND_ERROR", cause)
	}
}

/**
 * Union of all errors a get-latest-renewal-by-member-id flow can return. The
 * route's mapError branches on instanceof to pick the status code: both
 * not-found errors → 404 (distinct messages); DatabaseError and StorageError
 * (a presign failure — infra-level) → 500 with no leaky details.
 */
export type GetLatestRenewalByMemberIdError = MemberOrRenewalNotFoundError | RenewalNotFoundError | DatabaseError | StorageError
