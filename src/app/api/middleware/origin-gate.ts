import { NextRequest, NextResponse } from "next/server"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { createLogger } from "src/shared/lib/logger/logger"

const logger = createLogger(["api", "middleware", "origin-gate"])

type PublicRouteHandler = (request: NextRequest, context: unknown) => NextResponse<unknown> | Promise<NextResponse<unknown>>

/**
 * Lenient Origin/Referer gate for the STATE-CHANGING public routes (SEC-2,
 * spec #124): login, logout, upload, renewal submission. Composed OUTERMOST so
 * the gate decides before the write budget burns a slot —
 * `export const POST = withOriginGate(withPublicGuard("UPLOAD_WRITE", handler))`.
 *
 * A request is blocked with 403 `{ error_message }` ONLY when an Origin (or,
 * as fallback, Referer) header is present AND its origin is neither the
 * request's own origin (same-origin traffic always passes — zero-config
 * correct) nor in the env-configured `ORIGIN_ALLOW_LIST` (extra trusted
 * cross-origin domains only). Absent headers pass, so curl / Apidog / vitest
 * keep working unchanged. This kills the CORS-safelisted drive-by multipart
 * class (no preflight needed for those POSTs); it is explicitly NOT
 * authentication.
 *
 * Dev free pass mirrors withPublicGuard: `next dev` same-origin localhost
 * traffic would need an allow-list entry per machine. Deliberately NOT
 * `!== "production"` — that would also disable the gate under vitest
 * (NODE_ENV=test), where these tests prove it works.
 */
export function withOriginGate(handler: PublicRouteHandler): (request: NextRequest, context?: unknown) => Promise<NextResponse> {
	return async function originGate(request: NextRequest, context?: unknown): Promise<NextResponse> {
		const envConfig = container.resolve<EnvConfig>(REGISTER_KEY.ENV_CONFIG)
		if (envConfig.NODE_ENV === "development") {
			return handler(request, context)
		}
		if (!isOriginAllowed(request.headers, request.nextUrl.origin, envConfig.ORIGIN_ALLOW_LIST)) {
			const blockedOrigin = request.headers.get("origin") ?? request.headers.get("referer")
			logger.warn("Origin gate blocked: endpoint={endpoint} blockedOrigin={blockedOrigin}", {
				endpoint: request.nextUrl.pathname,
				blockedOrigin: blockedOrigin,
			})
			return NextResponse.json({ error_message: "Forbidden" } satisfies ResponseBodyError, { status: 403 })
		}
		return handler(request, context)
	}
}

/**
 * True when the request may pass the gate. Absent headers pass (non-browser
 * tooling). A present Origin/Referer passes when its origin equals the
 * request's OWN origin (same-origin traffic — browsers enforce Origin
 * integrity, JS cannot spoof it; this is what keeps the app's own frontend
 * working with NO env configuration, scrutiny MAJOR-3, PR #133) or is in the
 * env allow-list. Judge Origin first; Referer only when Origin is absent
 * (browsers send Origin on every fetch/form POST).
 *
 * The env allow-list is therefore only needed for EXTRA trusted cross-origin
 * domains, not for the site itself.
 */
function isOriginAllowed(headers: Headers, requestOrigin: string, allowListRaw: string | null | undefined): boolean {
	const headerValue = headers.get("origin") ?? headers.get("referer")
	if (headerValue === null) {
		return true
	}
	const origin = parseOrigin(headerValue)
	if (origin === null) {
		// Present but unparseable (`Origin: null` opaque origin, junk) — never
		// allow-listable.
		return false
	}
	if (origin === requestOrigin) {
		return true
	}
	const entries = allowListRaw?.split(",") ?? []
	for (const entry of entries) {
		if (parseOrigin(entry) === origin) {
			return true
		}
	}
	return false
}

/**
 * Normalize an Origin (or full Referer URL) to its comparable origin string —
 * lowercased scheme+host, default ports stripped — via URL parsing. Returns
 * null for anything that is not a plain http(s) origin (`Origin: null`, junk,
 * non-special schemes whose `.origin` would be the literal string "null").
 */
function parseOrigin(value: string): string | null {
	const trimmed = value.trim()
	if (trimmed.length === 0) {
		return null
	}
	try {
		const url = new URL(trimmed)
		if ((url.protocol !== "http:" && url.protocol !== "https:") || url.hostname.length === 0) {
			return null
		}
		return url.origin
	} catch {
		return null
	}
}
