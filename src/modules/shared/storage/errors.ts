import { AppError } from "src/shared/core/errors/app-error"

/**
 * Raised when an object storage operation (e.g. R2 PutObject) fails.
 * Generic infra-level error; module services may wrap it in a domain error.
 */
export class StorageError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "STORAGE_ERROR", cause)
	}
}
