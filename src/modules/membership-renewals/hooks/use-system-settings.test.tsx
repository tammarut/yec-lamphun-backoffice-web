import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useSystemSettings } from "src/modules/membership-renewals/hooks/use-system-settings"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderSettingsHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useSystemSettings(), { wrapper }), client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useSystemSettings", () => {
	describe("Happy cases", () => {
		test("fetches the public settings map from the exact URL", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/system-settings")
				return jsonResponse(200, { open_membership_renewal: true, maintenance_mode: false })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderSettingsHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data?.open_membership_renewal).toBe(true)
		})

		test("caches under the shared settings key so the gate and toggle read one value", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(200, { open_membership_renewal: false }))
			)
			const { result, client } = renderSettingsHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(client.getQueryData(["system-settings"])).toEqual({ open_membership_renewal: false })
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a 500 error with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(500, { error_message: "Internal Server Error" }))
			)
			const { result } = renderSettingsHook()
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(500)
			expect(result.current.error?.message).toBe("Internal Server Error")
		})
	})
})
