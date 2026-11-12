import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { memberDetailQueryKey, useMemberDetail } from "src/modules/members/hooks/use-member-detail"
import { makeMemberDetail } from "src/modules/members/components/make-member-detail.fixture"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderDetailHook(id: number | null) {
	// retry: false keeps unhappy cases single-flight instead of backing off.
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return renderHook(() => useMemberDetail(id), { wrapper })
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useMemberDetail", () => {
	describe("Happy cases", () => {
		test("fetches GET /api/v1/members/:id and exposes the detail payload", async () => {
			// Arrange
			const detail = makeMemberDetail()
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === "/api/v1/members/7") {
					return jsonResponse(200, detail)
				}
				return jsonResponse(404, { error_message: `unexpected url ${String(input)}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result } = renderDetailHook(7)

			// Assert
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data).toEqual(detail)
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(fetchMock).toHaveBeenCalledWith("/api/v1/members/7", undefined)
		})

		test("nests every id under the shared ['members','detail'] prefix", () => {
			// Arrange / Act / Assert — pure key contract
			expect(memberDetailQueryKey(7)).toEqual(["members", "detail", 7])
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a 404 as ApiError with the API's error_message", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(404, { error_message: "Member not found" }))
			)

			// Act
			const { result } = renderDetailHook(999)

			// Assert
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(404)
			expect(result.current.error?.message).toBe("Member not found")
		})

		test("falls back to the status-based message when the error body is not JSON", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("<html>boom</html>", { status: 502, headers: { "Content-Type": "text/html" } }))
			)

			// Act
			const { result } = renderDetailHook(7)

			// Assert
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(502)
			expect(result.current.error?.message).toBe("Request failed with status 502")
		})

		test("maps a network failure to status 0", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => {
					throw new TypeError("fetch failed")
				})
			)

			// Act
			const { result } = renderDetailHook(7)

			// Assert
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(0)
			expect(result.current.error?.message).toBe("Network request failed")
		})

		test("never fetches while id is null (create-mode gating)", async () => {
			// Arrange
			const fetchMock = vi.fn(async () => jsonResponse(200, makeMemberDetail()))
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result } = renderDetailHook(null)

			// Assert — the query settles into an idle-pending state with zero requests.
			await waitFor(() => expect(result.current.fetchStatus).toBe("idle"))
			expect(result.current.isPending).toBe(true)
			expect(fetchMock).not.toHaveBeenCalled()
		})
	})
})
