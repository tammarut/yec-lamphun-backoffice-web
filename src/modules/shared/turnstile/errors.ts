import { AppError } from "src/shared/core/errors/app-error"

import { TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE, TURNSTILE_VERIFICATION_FAILED_MESSAGE } from "./constants"

/** The one wording every 503-family rejection carries (pinned in constants.ts; call sites pass it explicitly). */
export { TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE }

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
