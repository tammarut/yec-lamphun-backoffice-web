import { AppError } from "src/shared/core/errors/app-error"

/** The one wording every 503-family rejection carries (pinned here — TurnstileServiceError's default message). */
export const TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE = "Human verification is temporarily unavailable"

/** The token itself failed verification (invalid / expired) → the 403 family. */
export class TurnstileVerificationError extends AppError {
	constructor() {
		super("Human verification failed", "TURNSTILE_VERIFICATION_FAILED")
	}
}

/**
 * Siteverify was unreachable, timed out, or the deployment is misconfigured
 * (empty/wrong secret) → the 503 family — retryable, and clearly distinct
 * from 403.
 */
export class TurnstileServiceError extends AppError {
	constructor(message = TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE, cause?: unknown) {
		super(message, "TURNSTILE_SERVICE_UNAVAILABLE", cause)
	}
}
