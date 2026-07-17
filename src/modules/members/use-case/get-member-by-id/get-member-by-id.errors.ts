import { AppError } from "src/shared/core/errors/app-error"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { StorageError } from "src/modules/shared/storage"

/**
 * Raised when the requested member id does not exist (or is soft-deleted —
 * the two are indistinguishable to the client per grilling Q6). Maps to 404.
 */
export class MemberNotFoundError extends AppError {
	constructor(message = "not found this member id", cause?: unknown) {
		super(message, "MEMBER_NOT_FOUND_ERROR", cause)
	}
}

/**
 * Union of all errors a get-member-by-id flow can return. The route's mapError
 * branches on instanceof to pick the status code.
 *
 * Deliberately EXCLUDES `CryptoError`: the service swallows decrypt/mask
 * failures to `null` + log (ADR-0008), so a CryptoError can never propagate to
 * the route. Excluding it keeps the union an honest model of what `execute`
 * actually returns. `StorageError` covers presign failures (infra-level — R2
 * unreachable/bad-creds), which DO propagate (unlike CryptoError) because they
 * are systemic, not per-field. `DatabaseError` covers the missing-business
 * corruption case (Q6/iii-a) and any DB failure.
 */
export type GetMemberByIdError = MemberNotFoundError | DatabaseError | StorageError
