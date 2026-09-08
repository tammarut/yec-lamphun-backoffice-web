import { AppError } from "src/shared/core/errors/app-error"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { MemberValidationError } from "src/modules/members/domain/errors"

// Re-export so use-case consumers can import all error types from one place.
export { MemberValidationError } from "src/modules/members/domain/errors"

/**
 * Why a create-member request conflicted with existing data. The contact
 * reasons (phone/email/line) are unique among LIVE members only — enforced by
 * the partial unique indexes uniq_members_*_live (WHERE deleted_at IS NULL).
 */
export type MemberConflictReason = "DUPLICATE_ID_CARD" | "POSITION_OCCUPIED" | "DUPLICATE_PHONE_NO" | "DUPLICATE_EMAIL" | "DUPLICATE_LINE_ID"

/**
 * Raised when a create-member request conflicts with existing data — a
 * duplicate id_card (by blind index), an already-held SINGLE position, or a
 * live-member contact conflict (phone/email/line). Maps to
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
