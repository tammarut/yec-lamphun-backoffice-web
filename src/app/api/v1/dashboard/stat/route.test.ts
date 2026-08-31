import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetDashboardStatService } from "src/modules/dashboard/use-case/get-dashboard-stat/get-dashboard-stat.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { GET } from "./route"

const VALIDATION_MESSAGE = "lookback_years must be between 1 and 20"

function makeRequest(query: string): NextRequest {
	return new NextRequest(`http://localhost:3000/api/v1/dashboard/stat${query}`)
}

describe("GET /api/v1/dashboard/stat", () => {
	let mockService: ReturnType<typeof mock<GetDashboardStatService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetDashboardStatService>()

		// Default happy stub: the spec's own example counts.
		mockService.execute.mockResolvedValue(
			ok({
				total_members: 10,
				total_active_members: 5,
				total_expired_members: 4,
				total_businesses: 10,
				total_members_each_year: { "2022": 4, "2023": 5, "2024": 6, "2025": 7, "2026": 8 },
			})
		)

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.GET_DASHBOARD_STAT_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the five headline counts", async () => {
			const response = await GET(makeRequest(""))

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({
				total_members: 10,
				total_active_members: 5,
				total_expired_members: 4,
				total_businesses: 10,
				total_members_each_year: { "2022": 4, "2023": 5, "2024": 6, "2025": 7, "2026": 8 },
			})
		})

		it("PUBLIC (no cookie): serves the stat without resolving any auth — no 401 path", async () => {
			const response = await GET(makeRequest(""))

			expect(response.status).toBe(200)
			expect(vi.mocked(container.resolve)).not.toHaveBeenCalledWith(REGISTER_KEY.AUTH_SERVICE)
		})

		it("absent lookback_years defaults to 5", async () => {
			await GET(makeRequest(""))

			expect(mockService.execute).toHaveBeenCalledWith(5)
		})

		it("passes an explicit lookback_years through to the service", async () => {
			await GET(makeRequest("?lookback_years=7"))

			expect(mockService.execute).toHaveBeenCalledWith(7)
		})

		it("lookback_years=1 and =20 (the bounds) are valid", async () => {
			await GET(makeRequest("?lookback_years=1"))
			await GET(makeRequest("?lookback_years=20"))

			expect(mockService.execute).toHaveBeenNthCalledWith(1, 1)
			expect(mockService.execute).toHaveBeenNthCalledWith(2, 20)
		})
	})

	describe("Unhappy cases", () => {
		it.each(["?lookback_years=0", "?lookback_years=21", "?lookback_years=-1", "?lookback_years=3.5", "?lookback_years=abc"])(
			"returns 400 with the spec message for %s",
			async (query) => {
				const response = await GET(makeRequest(query))

				expect(response.status).toBe(400)
				const json = (await response.json()) as ResponseBodyError
				expect(json.error_message).toBe(VALIDATION_MESSAGE)
				expect(mockService.execute).not.toHaveBeenCalled()
			}
		)

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const response = await GET(makeRequest(""))

			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
