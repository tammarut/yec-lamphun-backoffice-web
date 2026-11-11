import { NextRequest, NextResponse } from "next/server"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService, timingSafeStringEqual } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE, TURNSTILE_TOKEN_HEADER, TURNSTILE_VERIFICATION_FAILED_MESSAGE } from "src/modules/shared/turnstile/constants"
import { TurnstileServiceError } from "src/modules/shared/turnstile/errors"
import { TurnstileService } from "src/modules/shared/turnstile/turnstile.service"
import type { EnvConfig } from "src/shared/config/env"
import { createLogger } from "src/shared/lib/logger/logger"

const logger = createLogger(["api", "middleware", "turnstile-gate"])

/**
 * The ADR-0015 soft session fork, shared by the public renewal flow's two
 * POST routes (SEC-5, spec #124). The `session_id` cookie is OPTIONAL: absent
 * or invalid → false (no 401 — that is withAuth's job); a valid session →
 * true. Mirrors withAuth's container.resolve(AuthService) call but never
 * rejects, so both routes fork on the SAME cookie semantics instead of two
 * hand-rolled copies drifting apart.
 */
export function resolveIsAdmin(request: NextRequest): boolean {
	const sessionId = request.cookies.get("session_id")?.value
	if (sessionId === undefined) {
		return false
	}
	const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
	const sessionResult = authService.validateSession(sessionId)
	return sessionResult.isOk()
}

/**
 * The Turnstile human-verification gate for the public renewal flow (SEC-5,
 * spec #124). Guests (isAdmin=false) must present a human-verified token in
 * the `Yec-Turnstile-Token` request header (ADR-0028): missing/empty → 403
 * without calling siteverify; verified → pass. A valid admin session skips
 * verification entirely (staff wizard uploads and on-behalf filings keep
 * working exactly as today). Siteverify's own failures stay split: a token
 * verdict is 403, an unreachable/timed-out/misconfigured service is a
 * retryable 503 — and NEITHER ever lets the guarded write run (fail-closed;
 * fail-open anywhere is a defect).
 *
 * Reads the token from the request itself so both guarded routes stay
 * transport-agnostic and this file stays the ONE place the header is known.
 *
 * Regression-test bypass (#138, ADR-0029): when `CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN`
 * is set, a guest whose header EXACTLY equals that value passes without a
 * siteverify call — the Apidog suite's stand-in for a widget-minted token.
 * Missing/whitespace headers still fast-fail, any other value falls through
 * to the real verify flow, an admin session still skips entirely, and an
 * unset env leaves the gate byte-for-byte as SEC-5 shipped it (fail-closed).
 *
 * Returns null when the request may proceed, or a ready-to-send rejection.
 */
export async function enforceTurnstileToken(request: NextRequest, isAdmin: boolean): Promise<NextResponse<ResponseBodyError> | null> {
	if (isAdmin) {
		return null
	}
	const token = request.headers.get(TURNSTILE_TOKEN_HEADER)
	if (token === null || token.trim().length === 0) {
		// Missing/empty/whitespace-only all count as absent (scrutiny MINOR-1):
		// the cheap local check must not burn a siteverify round-trip on junk.
		// This stays AHEAD of the bypass compare — a whitespace token never
		// bypasses, even with the env set.
		return NextResponse.json({ error_message: TURNSTILE_VERIFICATION_FAILED_MESSAGE } satisfies ResponseBodyError, { status: 403 })
	}
	// Regression-test bypass (#138, ADR-0029). Its boot-time warn lives in
	// instrumentation.ts (server start, once per process) — not here.
	const envConfig = container.resolve<EnvConfig>(REGISTER_KEY.ENV_CONFIG)
	if (envConfig.CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN.length > 0 && timingSafeStringEqual(token, envConfig.CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN)) {
		return null
	}
	const turnstileService = container.resolve<TurnstileService>(REGISTER_KEY.TURNSTILE_SERVICE)
	const verifyResult = await turnstileService.verify(token, request.headers)
	if (verifyResult.isOk()) {
		return null
	}
	if (verifyResult.error instanceof TurnstileServiceError) {
		logger.warn("turnstile siteverify unavailable: {errorMessage} (code={code})", {
			code: verifyResult.error.code,
			// TurnstileServiceError.message carries the per-case diagnostic detail
			// (HTTP status / siteverify codes / missing-secret); the RESPONSE body
			// stays pinned to the canonical retryable wording — never leak
			// diagnostics into the contract (scrutiny: no leaky details).
			errorMessage: verifyResult.error.message,
			cause: verifyResult.error.cause,
		})
		return NextResponse.json({ error_message: TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE } satisfies ResponseBodyError, { status: 503 })
	}
	return NextResponse.json({ error_message: verifyResult.error.message } satisfies ResponseBodyError, { status: 403 })
}
