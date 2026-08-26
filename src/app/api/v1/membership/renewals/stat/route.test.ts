import { err, ok } from "neverthrow"
import { NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetRenewalStatService } from "src/modules/membership-renewals/use-case/get-renewal-stat/get-renewal-stat.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { GET } from "./route"

describe("GET /api/v1/membership/renewals/stat", () => {
	let mockService: ReturnType<typeof mock<GetRenewalStatService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetRenewalStatService>()

		// Default happy stub: the spec's own example counts.
		mockService.execute.mockResolvedValue(ok({ total_expired_members: 5, total_pending_review_members: 1, total_approved_members: 6 }))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.GET_RENEWAL_STAT_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the three badge counts", async () => {
			const response = await GET()

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({
				total_expired_members: 5,
				total_pending_review_members: 1,
				total_approved_members: 6,
			})
		})

		it("PUBLIC (no cookie): serves the stat without resolving any auth — no 401 path", async () => {
			const response = await GET()

			expect(response.status).toBe(200)
			expect(vi.mocked(container.resolve)).not.toHaveBeenCalledWith(REGISTER_KEY.AUTH_SERVICE)
		})

		it("zero state — an empty members table serves all-zero counts, still 200", async () => {
			mockService.execute.mockResolvedValue(ok({ total_expired_members: 0, total_pending_review_members: 0, total_approved_members: 0 }))

			const response = await GET()

			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({
				total_expired_members: 0,
				total_pending_review_members: 0,
				total_approved_members: 0,
			})
		})
	})

	describe("Unhappy cases", () => {
		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const response = await GET()

			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
