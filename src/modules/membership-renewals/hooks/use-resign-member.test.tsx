import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { RENEWALS_ROOT_QUERY_KEY } from "src/modules/membership-renewals/hooks/use-create-renewal"
import { useResignMember } from "src/modules/membership-renewals/hooks/use-resign-member"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status: status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderResignHook() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const invalidateSpy = vi.spyOn(client, "invalidateQueries")
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useResignMember(), { wrapper }), invalidateSpy, client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useResignMember", () => {
	describe("Happy cases", () => {
		test("POSTs to the resign subresource and invalidates the renewals root query key", async () => {
			// Arrange
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) !== "/api/v1/members/101/resign" || init?.method !== "POST") {
					return jsonResponse(404, { error_message: `unexpected request ${String(input)} ${init?.method ?? "GET"}` })
				}
				return jsonResponse(204)
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result, invalidateSpy } = renderResignHook()
			result.current.mutate(101)

			// Assert
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/members/101/resign")
			expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method).toBe("POST")
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: RENEWALS_ROOT_QUERY_KEY })
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces the 404 not-found message", async () => {
			// Arrange
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) === "/api/v1/members/404/resign" && init?.method === "POST") {
					return jsonResponse(404, { error_message: "not found this member id" })
				}
				return jsonResponse(500, { error_message: `unexpected request ${String(input)}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result, invalidateSpy } = renderResignHook()
			result.current.mutate(404)

			// Assert
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.message).toBe("not found this member id")
			// A failed resign has zero server-side effect — the cache must NOT
			// refetch (scrutiny F1; onSettled would have invalidated here).
			expect(invalidateSpy).not.toHaveBeenCalled()
		})

		test("surfaces the 409 not-expired message", async () => {
			// Arrange
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) === "/api/v1/members/409/resign" && init?.method === "POST") {
					return jsonResponse(409, { error_message: "member is not expired — only an EXPIRED member can be resigned" })
				}
				return jsonResponse(500, { error_message: `unexpected request ${String(input)}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result, invalidateSpy } = renderResignHook()
			result.current.mutate(409)

			// Assert
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.message).toBe("member is not expired — only an EXPIRED member can be resigned")
			expect(invalidateSpy).not.toHaveBeenCalled()
		})
	})
})
