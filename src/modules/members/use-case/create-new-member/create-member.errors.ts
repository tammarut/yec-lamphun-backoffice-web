import { AppError } from "src/shared/core/errors/app-error"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { MemberValidationError } from "src/modules/members/domain/errors"

// Re-export so use-case consumers can import all error types from one place.
export { MemberValidationError } from "src/modules/members/domain/errors"

/** Why a create-member request conflicted with existing data. */
export type MemberConflictReason = "DUPLICATE_ID_CARD" | "POSITION_OCCUPIED"

/**
 * Raised when a create-member request conflicts with existing data — either a
 * duplicate id_card (by blind index) or an already-held SINGLE position. Maps to
 * HTTP 409. The {@link reason} discriminator lets the route pick a precise
 * error_message without resorting to class proliferation.
 */
export class MemberConflictError extends AppError {
	readonly reason: MemberConflictReason
	constructor(reason: MemberConflictReason, message: string, cause?: unknown) {
		super(message, "MEMBER_CONFLICT_ERROR", cause)
		this.reason = reason
	}
}

/**
 * Union of all errors a create-member flow can return. The route's mapError
 * branches on instanceof to pick the right status code.
 */
export type CreateMemberError = MemberValidationError | MemberConflictError | CryptoError | DatabaseError
