import { TURNSTILE_VERIFICATION_FAILED_MESSAGE } from "src/modules/shared/turnstile/constants"
import { AppError } from "src/shared/core/errors/app-error"

/** The token itself failed verification (invalid / expired) → the 403 family. */
export class TurnstileVerificationError extends AppError {
	constructor() {
		super(TURNSTILE_VERIFICATION_FAILED_MESSAGE, "TURNSTILE_VERIFICATION_FAILED")
	}
}

/**
 * Siteverify was unreachable, timed out, or the deployment is misconfigured
 * (empty/wrong secret) → the 503 family — retryable, and clearly distinct
 * from 403.
 */
export class TurnstileServiceError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "TURNSTILE_SERVICE_UNAVAILABLE", cause)
	}
}
