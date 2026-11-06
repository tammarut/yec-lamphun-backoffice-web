import { NextRequest, NextResponse } from "next/server"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE, TurnstileServiceError } from "src/modules/shared/turnstile/errors"
import { TurnstileService } from "src/modules/shared/turnstile/turnstile.service"
import { createLogger } from "src/shared/lib/logger/logger"

const logger = createLogger(["api", "middleware", "turnstile-gate"])

/**
 * The ONE transport for the guest human-verification token (SEC-5, ADR-0028):
 * a request header on both public renewal-flow POSTs — a credential, not
 * request data, so it never rides the JSON body or the multipart form.
 * Hyphenated-Pascal-Case, `Yec-` org namespace, no `X-` prefix (RFC 6648),
 * no underscores (proxy-safe). Case-insensitive on the wire.
 */
export const TURNSTILE_TOKEN_HEADER = "Yec-Turnstile-Token"

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
		return NextResponse.json({ error_message: "Human verification failed" } satisfies ResponseBodyError, { status: 403 })
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
