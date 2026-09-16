import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { makeMembershipRenewal } from "src/modules/membership-renewals/components/make-membership-renewal.fixture"
import { useMembershipRenewals } from "src/modules/membership-renewals/hooks/use-membership-renewals"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function page(rows: ReturnType<typeof makeMembershipRenewal>[], hasMore = false, nextCursor: string | null = null) {
	return { data: rows, has_more: hasMore, next_cursor: nextCursor }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useMembershipRenewals", () => {
	describe("Happy cases", () => {
		test("fetches page 1 with limit + status params and omits empty search + absent cursor", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				expect(url).toBe("/api/v1/membership/renewals?limit=20&status=PENDING_REVIEW")
				return jsonResponse(200, page([makeMembershipRenewal()]))
			})
			vi.stubGlobal("fetch", fetchMock)

			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			const { result } = renderHook(() => useMembershipRenewals("PENDING_REVIEW", ""), {
				wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
			})
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data?.pages[0]?.data).toHaveLength(1)
			expect(result.current.hasNextPage).toBe(false)
		})

		test("accumulates pages via the cursor and stops when has_more is false", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url === "/api/v1/membership/renewals?limit=20&status=APPROVED") {
					return jsonResponse(200, page([makeMembershipRenewal({ id: 201 })], true, "201"))
				}
				if (url === "/api/v1/membership/renewals?limit=20&status=APPROVED&cursor=201") {
					return jsonResponse(200, page([makeMembershipRenewal({ id: 202 })]))
				}
				return jsonResponse(400, { error_message: `unexpected url ${url}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			const { result } = renderHook(() => useMembershipRenewals("APPROVED", ""), {
				wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
			})
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.hasNextPage).toBe(true)

			result.current.fetchNextPage()
			await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
			expect(result.current.hasNextPage).toBe(false)
			expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
				"/api/v1/membership/renewals?limit=20&status=APPROVED",
				"/api/v1/membership/renewals?limit=20&status=APPROVED&cursor=201",
			])
		})

		test("sends the search term with the status and restarts from page 1 on term change", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url.includes("search=")) {
					return jsonResponse(200, page([makeMembershipRenewal()]))
				}
				return jsonResponse(200, page([]))
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result, rerender } = renderHook(({ search }: { search: string }) => useMembershipRenewals("PENDING_REVIEW", search), {
				wrapper: ({ children }: { children: ReactNode }) => {
					const fresh = new QueryClient({ defaultOptions: { queries: { retry: false } } })
					return <QueryClientProvider client={fresh}>{children}</QueryClientProvider>
				},
				initialProps: { search: "" },
			})
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			rerender({ search: "081" })
			await waitFor(() => expect(result.current.data?.pages[0]?.data).toHaveLength(1))
			expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
				"/api/v1/membership/renewals?limit=20&status=PENDING_REVIEW",
				"/api/v1/membership/renewals?limit=20&status=PENDING_REVIEW&search=081",
			])
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a 400 invalid-cursor error with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(400, { error_message: "Invalid cursor" }))
			)
			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			const { result } = renderHook(() => useMembershipRenewals("PENDING_REVIEW", ""), {
				wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
			})
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(400)
			expect(result.current.error?.message).toBe("Invalid cursor")
		})
	})
})
