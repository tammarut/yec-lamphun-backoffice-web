import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { SYSTEM_SETTINGS_QUERY_KEY, useSystemSettings } from "src/modules/membership-renewals/hooks/use-system-settings"
import { useUpdateSystemSettings } from "src/modules/membership-renewals/hooks/use-update-system-settings"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/**
 * Renders the mutation alongside a live settings observer, exactly like the
 * page uses them — the settle-time invalidate only refetches ACTIVE queries,
 * so the observer must exist for the re-sync behavior to be observable.
 */
function renderMutationHook(initialSettings: { open_membership_renewal: boolean }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
	client.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, initialSettings)
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	const useComposite = () => {
		const settings = useSystemSettings()
		const update = useUpdateSystemSettings()
		return { settings, update }
	}
	return { ...renderHook(useComposite, { wrapper }), client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useUpdateSystemSettings", () => {
	describe("Happy cases", () => {
		test("PATCHes the boolean body and lands the server response in the cache", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("/api/v1/system-settings")
				expect(init?.method).toBe("PATCH")
				expect(init?.body).toBe(JSON.stringify({ open_membership_renewal: false }))
				return jsonResponse(200, { open_membership_renewal: false })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result, client } = renderMutationHook({ open_membership_renewal: true })
			result.current.update.mutate({ open_membership_renewal: false })
			await waitFor(() => expect(result.current.update.isSuccess).toBe(true))
			expect(client.getQueryData(SYSTEM_SETTINGS_QUERY_KEY)).toEqual({ open_membership_renewal: false })
		})

		test("flips the cached settings optimistically before the response arrives", async () => {
			// Declared without an initializer so control-flow narrowing keeps the
			// callable type at the invocation site (the assignment happens inside
			// the fetch stub's callback, which TS cannot see execute).
			let resolvePatch: ((response: Response) => void) | undefined
			vi.stubGlobal(
				"fetch",
				vi.fn(
					() =>
						new Promise<Response>((resolve) => {
							resolvePatch = resolve
						})
				)
			)

			const { result, client } = renderMutationHook({ open_membership_renewal: true })
			result.current.update.mutate({ open_membership_renewal: false })
			await waitFor(() => expect(client.getQueryData(SYSTEM_SETTINGS_QUERY_KEY)).toEqual({ open_membership_renewal: false }))

			resolvePatch?.(jsonResponse(200, { open_membership_renewal: false }))
			await waitFor(() => expect(result.current.update.isSuccess).toBe(true))
		})
	})

	describe("Unhappy cases", () => {
		test("rolls the cached settings back to the previous value on failure", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(500, { error_message: "Internal Server Error" }))
			)
			const { result, client } = renderMutationHook({ open_membership_renewal: true })
			result.current.update.mutate({ open_membership_renewal: false })
			await waitFor(() => expect(result.current.update.isError).toBe(true))
			expect(result.current.update.error?.status).toBe(500)
			expect(client.getQueryData(SYSTEM_SETTINGS_QUERY_KEY)).toEqual({ open_membership_renewal: true })
		})

		test("re-syncs the cache from the server once a failed mutation settles", async () => {
			const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PATCH") {
					return jsonResponse(401, { error_message: "Unauthorized" })
				}
				return jsonResponse(200, { open_membership_renewal: true })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result, client } = renderMutationHook({ open_membership_renewal: true })
			result.current.update.mutate({ open_membership_renewal: false })
			await waitFor(() => expect(result.current.update.isError).toBe(true))

			// onSettled invalidated the settings query — a GET must have been issued
			// AFTER the failed PATCH (the observer also GETs on mount, so order
			// against the PATCH, not the absolute count).
			const patchIndex = fetchMock.mock.calls.findIndex(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
			await waitFor(() => {
				const refetchedAfterPatch = fetchMock.mock.calls.some(
					([url, init], index) => index > patchIndex && String(url) === "/api/v1/system-settings" && (init as RequestInit | undefined)?.method !== "PATCH"
				)
				expect(refetchedAfterPatch).toBe(true)
			})
			expect(client.getQueryData(SYSTEM_SETTINGS_QUERY_KEY)).toEqual({ open_membership_renewal: true })
		})
	})
})
