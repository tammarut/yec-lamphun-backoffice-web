import { AppError } from "src/shared/core/errors/app-error"

/**
 * Raised when an encryption, decryption, or blind-index operation fails.
 * Generic infra-level error; module services may wrap it in a domain error.
 */
export class CryptoError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "CRYPTO_ERROR", cause)
	}
}
