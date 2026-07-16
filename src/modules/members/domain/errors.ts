import { AppError } from "src/shared/core/errors/app-error"

/**
 * Raised when a member fails a domain invariant that Valibot can't express
 * (time-dependent or cardinality-driven rules): id_card expiry vs today,
 * id_card format, position inactive, etc.
 *
 * A domain concern — returned by {@link IdCard.fromPlaintext},
 * {@link validateIdCardExpiry}, and {@link Member.create}. Maps to HTTP 400.
 */
export class MemberValidationError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "MEMBER_VALIDATION_ERROR", cause)
	}
}
