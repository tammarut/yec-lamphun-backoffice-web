import { NextRequest, NextResponse } from "next/server"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { TurnstileService, TurnstileServiceError } from "src/modules/shared/turnstile/turnstile.service"
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
 * spec #124). Guests (isAdmin=false) must present a human-verified token:
 * missing/empty → 403 without calling siteverify; verified → pass. A valid
 * admin session skips verification entirely (staff wizard uploads and
 * on-behalf filings keep working exactly as today). Siteverify's own failures
 * stay split: a token verdict is 403, an unreachable/timed-out/misconfigured
 * service is a retryable 503 — and NEITHER ever lets the guarded write run
 * (fail-closed; fail-open anywhere is a defect).
 *
 * Returns null when the request may proceed, or a ready-to-send rejection.
 */
export async function enforceTurnstileToken(request: NextRequest, token: string | null | undefined, isAdmin: boolean): Promise<NextResponse<ResponseBodyError> | null> {
	if (isAdmin) {
		return null
	}
	if (token === undefined || token === null || token.trim().length === 0) {
		// Whitespace-only counts as missing (scrutiny MINOR-1): the cheap local
		// check must not burn a siteverify round-trip on junk.
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
			errorMessage: verifyResult.error.message,
			cause: verifyResult.error.cause,
		})
		return NextResponse.json({ error_message: verifyResult.error.message } satisfies ResponseBodyError, { status: 503 })
	}
	return NextResponse.json({ error_message: verifyResult.error.message } satisfies ResponseBodyError, { status: 403 })
}
