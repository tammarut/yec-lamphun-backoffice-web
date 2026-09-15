import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useRenewalStat } from "src/modules/membership-renewals/hooks/use-renewal-stat"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderStatHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useRenewalStat(), { wrapper }), client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useRenewalStat", () => {
	describe("Happy cases", () => {
		test("fetches the three badge counts from the exact URL", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/membership/renewals/stat")
				return jsonResponse(200, {
					total_expired_members: 7,
					total_pending_review_members: 3,
					total_approved_members: 12,
				})
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderStatHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data).toEqual({
				total_expired_members: 7,
				total_pending_review_members: 3,
				total_approved_members: 12,
			})
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a network failure as an ApiError with status 0", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					throw new TypeError("network down")
				})
			)
			const { result } = renderStatHook()
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(0)
		})
	})
})
