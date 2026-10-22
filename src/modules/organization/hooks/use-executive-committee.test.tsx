import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { EXECUTIVE_COMMITTEE_QUERY_KEY, useExecutiveCommittee } from "src/modules/organization/hooks/use-executive-committee"
import type { GetExecutiveCommitteeResponse } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderCommitteeHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useExecutiveCommittee(), { wrapper }), client }
}

const PRESIDENT_TREE: GetExecutiveCommitteeResponse = {
	id: 1,
	profile_avatar: null,
	title_name_th: "นาย",
	first_name_th: "สมชาย",
	last_name_th: "ใจดี",
	nickname: "ชาย",
	position: "ประธาน",
	business_name: "ร้านกาแฟสมชาย",
	children: [],
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useExecutiveCommittee", () => {
	describe("Happy cases", () => {
		test("fetches the President-rooted tree from the exact URL", async () => {
			// Arrange
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/members/executive-committee")
				return jsonResponse(200, PRESIDENT_TREE)
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result } = renderCommitteeHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert
			expect(result.current.data).toEqual(PRESIDENT_TREE)
		})

		test("a JSON null body (no live President) resolves as data null, not an error", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(200, null))
			)

			// Act
			const { result } = renderCommitteeHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert
			expect(result.current.data).toBeNull()
		})

		test("caches under the organization committee key", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(200, PRESIDENT_TREE))
			)

			// Act
			const { result, client } = renderCommitteeHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert
			expect(EXECUTIVE_COMMITTEE_QUERY_KEY).toEqual(["organization", "executive-committee"])
			expect(client.getQueryData(EXECUTIVE_COMMITTEE_QUERY_KEY)).toEqual(PRESIDENT_TREE)
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
			const { result } = renderCommitteeHook()
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
			const { result } = renderCommitteeHook()
			await waitFor(() => expect(result.current.isError).toBe(true))

			// Assert
			expect(result.current.error?.status).toBe(0)
		})
	})
})
