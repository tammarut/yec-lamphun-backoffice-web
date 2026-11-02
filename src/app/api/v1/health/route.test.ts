import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

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

import { GET } from "./route"

const BASE_MS = 1_700_000_000_000

// Route-seam test (SEC-1 AC): the REAL guard + REAL limiter on a faked clock,
// with the container mocked per the house canonical pattern.
describe("GET /api/v1/health (withPublicGuard seam)", () => {
	let nowMs: number
	let limiter: RateLimiterService

	beforeEach(() => {
		nowMs = BASE_MS
		limiter = new RateLimiterService(() => new Date(nowMs))

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

	it("returns 204 while under budget", async () => {
		const request = new NextRequest("http://localhost/api/v1/health", {
			headers: { "x-forwarded-for": "203.0.113.9" },
		})

		const response = await GET(request, undefined)

		expect(response.status).toBe(204)
	})

	it("returns 429 with Retry-After and a structured warn line once the budget trips", async () => {
		const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
		for (let i = 0; i < budget.limit; i += 1) {
			const request = new NextRequest("http://localhost/api/v1/health", {
				headers: { "x-forwarded-for": "203.0.113.9" },
			})
			const response = await GET(request, undefined)
			expect(response.status).toBe(204)
		}

		const request = new NextRequest("http://localhost/api/v1/health", {
			headers: { "x-forwarded-for": "203.0.113.9" },
		})
		const response = await GET(request, undefined)

		expect(response.status).toBe(429)
		expect(await response.json()).toEqual({ error_message: "Too Many Requests" })
		expect(response.headers.get("Retry-After")).toBe(String(budget.windowMs / 1000))
		expect(loggerWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("endpoint={endpoint}"),
			expect.objectContaining({
				endpoint: "/api/v1/health",
				ip: "203.0.113.9",
				budget: "PUBLIC_READ",
			})
		)
	})

	it("keys the budget per trusted IP: a different client is unaffected", async () => {
		const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
		for (let i = 0; i <= budget.limit; i += 1) {
			const request = new NextRequest("http://localhost/api/v1/health", {
				headers: { "x-forwarded-for": "203.0.113.9" },
			})
			await GET(request, undefined)
		}

		const otherClient = new NextRequest("http://localhost/api/v1/health", {
			headers: { "x-forwarded-for": "203.0.113.10" },
		})
		const response = await GET(otherClient, undefined)

		expect(response.status).toBe(204)
	})
})
