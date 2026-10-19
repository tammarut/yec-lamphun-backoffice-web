import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useDashboardStat } from "src/modules/dashboard/hooks/use-dashboard-stat"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderStatHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useDashboardStat(), { wrapper }), client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useDashboardStat", () => {
	describe("Happy cases", () => {
		test("fetches the five headline counts from the exact URL", async () => {
			// Arrange
			const statFixture = {
				total_members: 42,
				total_active_members: 30,
				total_expired_members: 8,
				total_businesses: 25,
				total_members_each_year: { "2022": 4, "2023": 9, "2024": 12, "2025": 11, "2026": 6 },
			}
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/dashboard/stat")
				return jsonResponse(200, statFixture)
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result } = renderStatHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert
			expect(result.current.data).toEqual(statFixture)
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces an API error body as an ApiError with the status code", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(500, { error_message: "Internal Server Error" }))
			)

			// Act
			const { result } = renderStatHook()
			await waitFor(() => expect(result.current.isError).toBe(true))

			// Assert
			expect(result.current.error?.status).toBe(500)
			expect(result.current.error?.message).toBe("Internal Server Error")
		})

		test("surfaces a network failure as an ApiError with status 0", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					throw new TypeError("network down")
				})
			)

			// Act
			const { result } = renderStatHook()
			await waitFor(() => expect(result.current.isError).toBe(true))

			// Assert
			expect(result.current.error?.status).toBe(0)
		})
	})
})
