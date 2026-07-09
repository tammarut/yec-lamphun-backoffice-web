import { AppError } from "src/shared/core/errors/app-error"
import { StorageError } from "src/modules/shared/storage"

/** Raised when a provided file fails size or extension validation. Maps to HTTP 400. */
export class MemberFileValidationError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "MEMBER_FILE_VALIDATION_ERROR", cause)
	}
}

/**
 * Union of member-file errors. The storage layer surfaces {@link StorageError}
 * (an infra error); the service returns it as-is and the route maps it to 500.
 */
export type MemberFileError = MemberFileValidationError | StorageError
