import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useExpiredMemberships } from "src/modules/membership-renewals/hooks/use-expired-memberships"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderExpiredHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useExpiredMemberships(""), { wrapper }), client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useExpiredMemberships", () => {
	describe("Happy cases", () => {
		test("fetches page 1 with the limit param and omits empty search + absent cursor", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				expect(url).toBe("/api/v1/membership/renewals/expired?limit=20")
				return jsonResponse(200, { data: [makeExpiredMembership()], has_more: false, next_cursor: null })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderExpiredHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data?.pages).toHaveLength(1)
			expect(result.current.data?.pages[0]?.data).toHaveLength(1)
			expect(result.current.hasNextPage).toBe(false)
		})

		test("accumulates pages via the cursor and stops when has_more is false", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url === "/api/v1/membership/renewals/expired?limit=20") {
					return jsonResponse(200, {
						data: [makeExpiredMembership({ id: 101 })],
						has_more: true,
						next_cursor: "101",
					})
				}
				if (url === "/api/v1/membership/renewals/expired?limit=20&cursor=101") {
					return jsonResponse(200, {
						data: [makeExpiredMembership({ id: 102 })],
						has_more: false,
						next_cursor: null,
					})
				}
				return jsonResponse(400, { error_message: `unexpected url ${url}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderExpiredHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.hasNextPage).toBe(true)

			result.current.fetchNextPage()
			await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
			expect(result.current.hasNextPage).toBe(false)
			expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
				"/api/v1/membership/renewals/expired?limit=20",
				"/api/v1/membership/renewals/expired?limit=20&cursor=101",
			])
		})

		test("sends the search term and restarts from page 1 (no cursor) when the term changes", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url.includes("search=")) {
					return jsonResponse(200, { data: [makeExpiredMembership()], has_more: false, next_cursor: null })
				}
				return jsonResponse(200, { data: [], has_more: false, next_cursor: null })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result, rerender } = renderHook(({ search }: { search: string }) => useExpiredMemberships(search), {
				wrapper: ({ children }: { children: ReactNode }) => {
					const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
					return <QueryClientProvider client={client}>{children}</QueryClientProvider>
				},
				initialProps: { search: "" },
			})
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			rerender({ search: "สมชาย" })
			await waitFor(() => expect(result.current.data?.pages[0]?.data).toHaveLength(1))
			expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
				"/api/v1/membership/renewals/expired?limit=20",
				"/api/v1/membership/renewals/expired?limit=20&search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2",
			])
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a 400 invalid-cursor error with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(400, { error_message: "Invalid cursor" }))
			)
			const { result } = renderExpiredHook()
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(400)
			expect(result.current.error?.message).toBe("Invalid cursor")
		})
	})
})
