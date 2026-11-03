import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

const { loggerWarnSpy } = vi.hoisted(() => ({
	loggerWarnSpy: vi.fn(),
}))

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Mock the logger wrapper so route code's logger.error calls don't leak into
// test output, and so the SEC-1 seam tests can assert the structured 429 warn
// line. Matches the canonical route-test pattern (mock the seam, not the
// underlying library). See docs/adr/0009.
vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		error: vi.fn(),
		warn: loggerWarnSpy,
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { RATE_LIMIT_BUDGETS, RateLimiterService } from "src/modules/shared/rate-limiter/rate-limiter.service"
import type { EnvConfig } from "src/shared/config/env"
import { BusinessCategoryDomain } from "src/modules/business-categories/domain/business-category.domain"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"

// Import route AFTER mocks
import { GET } from "./route"

const BASE_MS = 1_700_000_000_000

describe("GET /api/v1/business/categories", () => {
	let mockService: ReturnType<typeof mock<BusinessCategoriesService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<BusinessCategoriesService>()
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE) return mockService
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) return new RateLimiterService(() => new Date())
			return {}
		})
	})

	it("should return 200 and mapped business categories", async () => {
		const mockCategories: BusinessCategoryDomain[] = [
			{ id: 1, name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
			{ id: 2, name: "อุตสาหกรรมการผลิต" },
		]

		mockService.getBusinessCategories.mockResolvedValue(ok(mockCategories))

		const response = await GET(new NextRequest("http://localhost/api/v1/business/categories"))

		expect(response).toBeInstanceOf(NextResponse)
		expect(response.status).toBe(200)

		const json = await response.json()
		expect(json).toEqual({
			business_categories: [
				{ id: 1, category_name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
				{ id: 2, category_name: "อุตสาหกรรมการผลิต" },
			],
		})
		expect(mockService.getBusinessCategories).toHaveBeenCalledTimes(1)
		expect(container.resolve).toHaveBeenCalledWith(REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE)
	})

	it("should return 200 with empty array when no categories exist", async () => {
		mockService.getBusinessCategories.mockResolvedValue(ok([]))

		const response = await GET(new NextRequest("http://localhost/api/v1/business/categories"))

		expect(response.status).toBe(200)
		const json = await response.json()
		expect(json).toEqual({ business_categories: [] })
	})

	it("should return 500 when service returns error", async () => {
		mockService.getBusinessCategories.mockResolvedValue(err(new DatabaseError("DB Error")))

		const response = await GET(new NextRequest("http://localhost/api/v1/business/categories"))

		expect(response.status).toBe(500)
		const json = await response.json()
		expect(json).toEqual({ error_message: "Internal Server Error" })
	})

	// Route-seam test (SEC-1 AC): the REAL guard + REAL limiter on a faked
	// clock, with the container mocked per the house canonical pattern. Lives
	// here since /health is deliberately unguarded (SEC-1 scrutiny).
	describe("(withPublicGuard seam — faked clock)", () => {
		let nowMs: number
		let limiter: RateLimiterService

		beforeEach(() => {
			nowMs = BASE_MS
			limiter = new RateLimiterService(() => new Date(nowMs))
			mockService.getBusinessCategories.mockResolvedValue(ok([]))

			vi.mocked(container.resolve).mockImplementation((token) => {
				if (token === REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE) return mockService
				if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
					return limiter
				}
				if (token === REGISTER_KEY.ENV_CONFIG) {
					return { CLOUDFLARE_CIDRS: "", NODE_ENV: "test" } as unknown as EnvConfig
				}
				return {}
			})

			loggerWarnSpy.mockClear()
		})

		it("returns 200 while under budget", async () => {
			const response = await GET(new NextRequest("http://localhost/api/v1/business/categories"))

			expect(response.status).toBe(200)
		})

		it("returns 429 with Retry-After and a structured warn line once the budget trips", async () => {
			const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
			for (let i = 0; i < budget.limit; i += 1) {
				const request = new NextRequest("http://localhost/api/v1/business/categories")
				const response = await GET(request, undefined)
				expect(response.status).toBe(200)
			}

			const request = new NextRequest("http://localhost/api/v1/business/categories")
			const response = await GET(request, undefined)

			expect(response.status).toBe(429)
			expect(await response.json()).toEqual({ error_message: "Too Many Requests" })
			expect(response.headers.get("Retry-After")).toBe(String(budget.windowMs / 1000))
			expect(loggerWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("endpoint={endpoint}"),
				expect.objectContaining({
					endpoint: "/api/v1/business/categories",
					ip: "unknown",
					budget: "PUBLIC_READ",
				})
			)
		})

		it("keys the budget per trusted IP: a different client is unaffected", async () => {
			const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
			for (let i = 0; i <= budget.limit; i += 1) {
				const request = new NextRequest("http://localhost/api/v1/business/categories", {
					headers: { "x-forwarded-for": "203.0.113.9" },
				})
				await GET(request, undefined)
			}

			const otherClient = new NextRequest("http://localhost/api/v1/business/categories", {
				headers: { "x-forwarded-for": "203.0.113.10" },
			})
			const response = await GET(otherClient, undefined)

			expect(response.status).toBe(200)
		})
	})
})
