import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"

import { REGISTER_KEY } from "src/modules/di-tokens"
import { resolveTrustedClientIp } from "src/modules/shared/client-ip/resolve-trusted-client-ip"
import type { EnvConfig } from "src/shared/config/env"
import { AppError } from "src/shared/core/errors/app-error"

/** Cloudflare's fixed siteverify endpoint (Turnstile server-side validation). */
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** The ~5 s siteverify budget (spec #124); past it the outcome is 503-retryable. */
export const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000

export type TurnstileAllowance = {
	readonly verified: true
}

/** The token itself failed verification (invalid / expired) → the 403 family. */
export class TurnstileVerificationError extends AppError {
	constructor() {
		super("Human verification failed", "TURNSTILE_VERIFICATION_FAILED")
	}
}

/**
 * Siteverify was unreachable, timed out, or the deployment is misconfigured
 * (empty secret) → the 503 family — retryable, and clearly distinct from 403.
 */
export class TurnstileServiceError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "TURNSTILE_SERVICE_UNAVAILABLE", cause)
	}
}

/** The narrow shape the gate reads off the siteverify JSON body. */
type SiteverifyPayload = {
	success: unknown
}

function isSiteverifyPayload(value: unknown): value is SiteverifyPayload {
	return typeof value === "object" && value !== null && "success" in value
}

/**
 * Server-side Cloudflare Turnstile verification (SEC-5, spec #124). One call
 * per guest token: siteverify with the server-only secret, the client token,
 * and `remoteip` derived by the SAME trusted-IP helper the rate limiter uses
 * (never a spoofable header alone). The outcome mapping is the fail-closed
 * split the spec mandates — success=true is the ONLY pass; a token verdict is
 * 403, and everything server-side (network, timeout, HTTP error, malformed
 * body, missing secret) is 503. Fail-open is a defect, not a feature.
 */
@injectable()
export class TurnstileService {
	constructor(@inject(REGISTER_KEY.ENV_CONFIG) private readonly envConfig: EnvConfig) {}

	async verify(token: string, headers: Headers): Promise<Result<TurnstileAllowance, TurnstileVerificationError | TurnstileServiceError>> {
		const secret = this.envConfig.TURNSTILE_SECRET_KEY
		if (secret.length === 0) {
			// Deployment misconfiguration is a SERVER-side fault: never a silent
			// pass, and never burned into a guest-attributed 403.
			return err(new TurnstileServiceError("Human verification is temporarily unavailable", "TURNSTILE_SECRET_KEY is not configured"))
		}

		const remoteIp = resolveTrustedClientIp(headers, this.envConfig.CLOUDFLARE_CIDRS)
		const form = new URLSearchParams({ secret: secret, response: token })
		if (remoteIp !== null) {
			form.set("remoteip", remoteIp)
		}

		try {
			const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: form.toString(),
				signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
			})
			if (!response.ok) {
				return err(new TurnstileServiceError("Human verification is temporarily unavailable", `siteverify HTTP ${String(response.status)}`))
			}
			const payload: unknown = await response.json()
			if (isSiteverifyPayload(payload)) {
				if (payload.success === true) {
					return ok({ verified: true })
				}
				if (payload.success === false) {
					return err(new TurnstileVerificationError())
				}
			}
			// `success` missing or the wrong type — unparseable, server-side family.
			return err(new TurnstileServiceError("Human verification is temporarily unavailable", "malformed siteverify payload"))
		} catch (error) {
			// A fetch-level failure: siteverify unreachable OR the 5 s timeout
			// fired — both retryable 503s, never a pass.
			return err(new TurnstileServiceError("Human verification is temporarily unavailable", error))
		}
	}
}
