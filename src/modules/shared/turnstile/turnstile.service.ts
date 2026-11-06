import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"

import { REGISTER_KEY } from "src/modules/di-tokens"
import { resolveTrustedClientIp } from "src/modules/shared/client-ip/resolve-trusted-client-ip"
import { TurnstileServiceError, TurnstileVerificationError } from "src/modules/shared/turnstile/errors"
import type { EnvConfig } from "src/shared/config/env"
import { createLogger } from "src/shared/lib/logger/logger"

/** Cloudflare's fixed siteverify endpoint (Turnstile server-side validation). */
export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

/** The ~5 s siteverify budget (spec #124); past it the outcome is 503-retryable. */
export const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000

/** The service's success result — the only pass outcome the gate accepts. */
export type TurnstileAllowance = {
	readonly verified: true
}

/**
 * Siteverify error-codes that describe a SERVER fault, not the client's token
 * (Cloudflare docs: bad/missing secret, malformed request, their internal
 * error). These deploy as HTTP 200 + success:false — without this set, a
 * wrong secret would show guests a non-retryable "token failed" 403 and the
 * 403/503 split would silently collapse on exactly the faults it exists to
 * expose.
 */
const SERVER_FAULT_SITEVERIFY_CODES: ReadonlySet<string> = new Set(["missing-input-secret", "invalid-input-secret", "bad-request", "internal-error"])

const logger = createLogger(["shared", "turnstile"])

/**
 * Server-side Cloudflare Turnstile verification (SEC-5, spec #124). One call
 * per guest token: siteverify with the server-only secret, the client token,
 * and `remoteip` derived by the SAME trusted-IP helper the rate limiter uses
 * (never a spoofable header alone). The outcome mapping is the fail-closed
 * split the spec mandates — success=true is the ONLY pass; a token verdict is
 * 403 (TurnstileVerificationError), and everything server-side (network,
 * timeout, HTTP error, malformed body, missing secret) is 503
 * (TurnstileServiceError — see errors.ts). Fail-open is a defect, not a
 * feature.
 *
 * Observability: this is the app's FIRST third-party call, so both sides of
 * it are logged at info (visible in prod JSON logs) — a request line on
 * dispatch and a response line with outcome + duration. The secret is NEVER
 * logged; the token appears only as a character count (single-use value with
 * no diagnostic upside in full form).
 */
@injectable()
export class TurnstileService {
	constructor(@inject(REGISTER_KEY.ENV_CONFIG) private readonly envConfig: EnvConfig) {}

	async verify(token: string, headers: Headers): Promise<Result<TurnstileAllowance, TurnstileVerificationError | TurnstileServiceError>> {
		const secret = this.envConfig.CLOUDFLARE_TURNSTILE_SECRET_KEY.trim()
		if (secret.length === 0) {
			// Deployment misconfiguration is a SERVER-side fault: never a silent
			// pass, and never burned into a guest-attributed 403.
			logger.info("turnstile verify: fail-closed — secret not configured, siteverify not called", {
				outcome: "service_error",
				request_sent: false,
				token_chars: token.length,
			})
			return err(new TurnstileServiceError("CLOUDFLARE_TURNSTILE_SECRET_KEY is not configured"))
		}

		const remoteIp = resolveTrustedClientIp(headers, this.envConfig.CLOUDFLARE_CIDRS)
		const form = new URLSearchParams({ secret: secret, response: token })
		if (remoteIp !== null) {
			form.set("remoteip", remoteIp)
		}

		logger.info("turnstile verify: siteverify request dispatched", {
			endpoint: TURNSTILE_SITEVERIFY_URL,
			token_chars: token.length,
			remoteip: remoteIp,
			timeout_ms: TURNSTILE_VERIFY_TIMEOUT_MS,
		})
		const startedAtMs = Date.now()

		let httpStatus: number | null = null
		let result: Result<TurnstileAllowance, TurnstileVerificationError | TurnstileServiceError>
		try {
			const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: form.toString(),
				signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
			})
			httpStatus = response.status
			if (!response.ok) {
				result = err(new TurnstileServiceError(`siteverify HTTP ${String(response.status)}`))
			} else {
				const payload: unknown = await response.json()
				if (isSiteverifyPayload(payload)) {
					if (payload.success === true) {
						result = ok({ verified: true })
					} else if (payload.success === false) {
						const codes = readErrorCodes(payload)
						let serverFault = false
						for (const code of codes) {
							if (SERVER_FAULT_SITEVERIFY_CODES.has(code)) {
								serverFault = true
								break
							}
						}
						if (serverFault) {
							result = err(new TurnstileServiceError(`siteverify error-codes: ${codes.join(", ")}`))
						} else {
							// Token-attributed codes (missing/invalid-input-response,
							// timeout-or-duplicate) and unknown future codes — the
							// verdict is on the token, so 403.
							result = err(new TurnstileVerificationError())
						}
					} else {
						// `success` missing or the wrong type — unparseable,
						// server-side family.
						result = err(new TurnstileServiceError("malformed siteverify payload"))
					}
				} else {
					result = err(new TurnstileServiceError("malformed siteverify payload"))
				}
			}
		} catch (error) {
			// A fetch-level failure: siteverify unreachable OR the 5 s timeout
			// fired — both retryable 503s, never a pass.
			result = err(new TurnstileServiceError(undefined, error))
		}

		const durationMs = Date.now() - startedAtMs
		if (result.isOk()) {
			logger.info("turnstile verify: siteverify response — token verified", {
				outcome: "ok",
				http_status: httpStatus,
				duration_ms: durationMs,
			})
		} else {
			logger.info("turnstile verify: siteverify response — rejected (fail-closed)", {
				outcome: result.error instanceof TurnstileVerificationError ? "token_rejected" : "service_error",
				http_status: httpStatus,
				detail: result.error.message,
				cause: result.error.cause,
				duration_ms: durationMs,
			})
		}
		return result
	}
}

/** The narrow shape the gate reads off the siteverify JSON body. */
type SiteverifyPayload = {
	success: unknown
	"error-codes"?: unknown
}

function isSiteverifyPayload(value: unknown): value is SiteverifyPayload {
	return typeof value === "object" && value !== null && "success" in value
}

/** The payload's error-codes as strings, or [] when absent/malformed. */
function readErrorCodes(payload: SiteverifyPayload): string[] {
	const codes = payload["error-codes"]
	if (!Array.isArray(codes)) {
		return []
	}
	const valid: string[] = []
	for (const code of codes) {
		if (typeof code === "string") {
			valid.push(code)
		}
	}
	return valid
}
