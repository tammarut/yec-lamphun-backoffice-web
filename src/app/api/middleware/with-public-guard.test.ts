import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const { loggerWarnSpy } = vi.hoisted(() => ({
	loggerWarnSpy: vi.fn(),
}))

vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		warn: loggerWarnSpy,
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { RATE_LIMIT_BUDGETS, RateLimiterService } from "src/modules/shared/rate-limiter/rate-limiter.service"

import { withPublicGuard } from "./with-public-guard"

const BASE_MS = 1_700_000_000_000

describe("withPublicGuard", () => {
	let nowMs: number
	let limiter: RateLimiterService
	let handlerResponse: NextResponse<{ ok: boolean }>
	let handler: ReturnType<typeof vi.fn<(request: NextRequest, context: unknown) => Promise<NextResponse<{ ok: boolean }>>>>

	beforeEach(() => {
		nowMs = BASE_MS
		limiter = new RateLimiterService(() => new Date(nowMs))
		handlerResponse = NextResponse.json({ ok: true })
		handler = vi.fn<(request: NextRequest, context: unknown) => Promise<NextResponse<{ ok: boolean }>>>()
		handler.mockResolvedValue(handlerResponse)

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
				return limiter
			}
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return { CLOUDFLARE_CIDRS: "" } as unknown as EnvConfig
			}
			return {}
		})

		loggerWarnSpy.mockClear()
	})

	function guardedRequest(clientIp: string): NextRequest {
		return new NextRequest("http://localhost/api/v1/test", {
			headers: { "x-forwarded-for": clientIp },
		})
	}

	it("passes the request and context through to the handler while under budget", async () => {
		const guarded = withPublicGuard("PUBLIC_READ", handler)
		const request = guardedRequest("203.0.113.9")
		const context = { params: {} }

		const response = await guarded(request, context)

		expect(response).toBe(handlerResponse)
		expect(handler).toHaveBeenCalledWith(request, context)
	})

	it("keys the budget on the trusted client IP: a second client is unaffected by the first", async () => {
		const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
		const guarded = withPublicGuard("PUBLIC_READ", handler)

		for (let i = 0; i < budget.limit; i += 1) {
			await guarded(guardedRequest("203.0.113.9"), undefined)
		}
		const response = await guarded(guardedRequest("203.0.113.10"), undefined)

		expect(response.status).toBe(200)
	})

	it("returns 429 with the canonical error body and Retry-After once the budget trips", async () => {
		const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
		const guarded = withPublicGuard("PUBLIC_READ", handler)

		for (let i = 0; i < budget.limit; i += 1) {
			const underBudget = await guarded(guardedRequest("203.0.113.9"), undefined)
			expect(underBudget.status).toBe(200)
		}

		const overBudget = await guarded(guardedRequest("203.0.113.9"), undefined)

		expect(overBudget.status).toBe(429)
		expect(await overBudget.json()).toEqual({ error_message: "Too Many Requests" })
		expect(overBudget.headers.get("Retry-After")).toBe(String(budget.windowMs / 1000))
	})

	it("logs a structured line with endpoint, trusted IP and budget name on every 429", async () => {
		const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
		const guarded = withPublicGuard("PUBLIC_READ", handler)
		for (let i = 0; i <= budget.limit; i += 1) {
			await guarded(guardedRequest("203.0.113.9"), undefined)
		}

		expect(loggerWarnSpy).toHaveBeenCalledTimes(1)
		expect(loggerWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("endpoint={endpoint}"),
			expect.objectContaining({
				endpoint: "/api/v1/test",
				ip: "203.0.113.9",
				budget: "PUBLIC_READ",
			})
		)
	})
})
