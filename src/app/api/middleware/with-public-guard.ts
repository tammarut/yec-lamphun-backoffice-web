import { NextRequest, NextResponse } from "next/server"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { resolveTrustedClientIp } from "src/modules/shared/client-ip/resolve-trusted-client-ip"
import { RateLimiterService, type RateLimitBudgetName } from "src/modules/shared/rate-limiter/rate-limiter.service"
import type { EnvConfig } from "src/shared/config/env"
import { createLogger } from "src/shared/lib/logger/logger"

const logger = createLogger(["api", "middleware", "public-guard"])

type PublicRouteHandler = (request: NextRequest, context: unknown) => NextResponse<unknown> | Promise<NextResponse<unknown>>

/**
 * Rate-limit guard for the public routes (SEC-1, spec #124). Composes exactly
 * like `withAuth`: wrap a handler, export the result as the route verb —
 * `export const GET = withPublicGuard("PUBLIC_READ", listMembers)`. Budgets
 * are keyed on the trusted client IP (see resolveTrustedClientIp); over-budget
 * requests get 429 + `Retry-After` and a structured warn line. Handlers keep
 * their own `(request, context)` signature, so stacking over `withAuth` later
 * stays possible.
 */
export function withPublicGuard(budgetName: RateLimitBudgetName, handler: PublicRouteHandler): (request: NextRequest, context?: unknown) => Promise<NextResponse> {
	return async function publicGuard(request: NextRequest, context?: unknown): Promise<NextResponse> {
		const envConfig = container.resolve<EnvConfig>(REGISTER_KEY.ENV_CONFIG)
		// Dev free pass: `next dev` has no reverse proxy, so every request would
		// share the "unknown" bucket. Deliberately NOT `!== "production"` — that
		// would also disable the guard under vitest (NODE_ENV=test).
		if (envConfig.NODE_ENV === "development") {
			return handler(request, context)
		}
		const trustedIp = resolveTrustedClientIp(request.headers, envConfig.CLOUDFLARE_CIDRS)
		if (trustedIp === null) {
			// Prod hit with no proxy-reported peer — the budget would collapse all
			// unproxied callers into one "unknown" bucket, so make it observable.
			logger.warn("No trusted client IP: endpoint={endpoint} — reverse proxy XFF missing?", {
				endpoint: request.nextUrl.pathname,
			})
		}
		const clientKey = trustedIp ?? "unknown"

		const limiter = container.resolve<RateLimiterService>(REGISTER_KEY.RATE_LIMITER_SERVICE)
		const checkResult = limiter.check(budgetName, clientKey)
		if (checkResult.isErr()) {
			logger.warn("Rate limit tripped: endpoint={endpoint} ip={ip} budget={budget} retry_after_seconds={retryAfterSeconds}", {
				endpoint: request.nextUrl.pathname,
				ip: clientKey,
				budget: budgetName,
				retryAfterSeconds: checkResult.error.retryAfterSeconds,
			})
			return NextResponse.json({ error_message: "Too Many Requests" } satisfies ResponseBodyError, {
				status: 429,
				headers: { "Retry-After": String(checkResult.error.retryAfterSeconds) },
			})
		}
		return handler(request, context)
	}
}
