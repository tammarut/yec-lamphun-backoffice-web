import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { ORGANIZATION_MEMBERS_QUERY_KEY, useOrganizationMembers } from "src/modules/organization/hooks/use-organization-members"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderMembersHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useOrganizationMembers(), { wrapper }), client }
}

function generalMember(id: number): MemberListItemResponse {
	return {
		id,
		profile_avatar: null,
		registration_type: "INDIVIDUAL",
		title_name_th: "นาย",
		first_name_th: `สมชาย${id}`,
		last_name_th: "ใจดี",
		nickname: "ชาย",
		phone_no: "089-111-2222",
		email: null,
		line_id: null,
		position: "GENERAL_MEMBER",
		status: "ACTIVE",
		business: { name: "ร้านกาแฟสมชาย", description: "กาแฟคั่วบด" },
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useOrganizationMembers", () => {
	describe("Happy cases", () => {
		test("fetches page one with the position filter, the live-status trio, and no cursor", async () => {
			// Arrange
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/members?limit=20&position=GENERAL_MEMBER&status=ACTIVE%2CPENDING_RENEWAL%2CEXPIRED")
				return jsonResponse(200, { data: [generalMember(1)], has_more: false, next_cursor: null })
			})
			vi.stubGlobal("fetch", fetchMock)

			// Act
			const { result } = renderMembersHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert
			expect(result.current.data?.pages).toEqual([{ data: [generalMember(1)], has_more: false, next_cursor: null }])
		})

		test("caches under the shared members list key so the members page and this grid share one cache tree", async () => {
			// Arrange
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(200, { data: [generalMember(1)], has_more: false, next_cursor: null }))
			)

			// Act
			const { result, client } = renderMembersHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))

			// Assert — identical literal key to the members module's own entries.
			expect(ORGANIZATION_MEMBERS_QUERY_KEY).toEqual(["members", "list", "position=GENERAL_MEMBER&status=ACTIVE,PENDING_RENEWAL,EXPIRED"])
			expect(client.getQueryData(ORGANIZATION_MEMBERS_QUERY_KEY)).toEqual({
				pages: [{ data: [generalMember(1)], has_more: false, next_cursor: null }],
				pageParams: [null],
			})
		})

		test("load-more fetches the next page through the server cursor and accumulates both pages", async () => {
			// Arrange
			const urls: string[] = []
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL) => {
					const url = String(input)
					urls.push(url)
					const cursor = new URLSearchParams(url.split("?")[1] ?? "").get("cursor")
					if (cursor === null) {
						return jsonResponse(200, { data: [generalMember(1), generalMember(2)], has_more: true, next_cursor: "2" })
					}
					return jsonResponse(200, { data: [generalMember(3)], has_more: false, next_cursor: null })
				})
			)

			// Act
			const { result } = renderMembersHook()
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			result.current.fetchNextPage()
			await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))

			// Assert
			expect(urls).toHaveLength(2)
			expect(urls[1]).toBe("/api/v1/members?limit=20&position=GENERAL_MEMBER&status=ACTIVE%2CPENDING_RENEWAL%2CEXPIRED&cursor=2")
			expect(result.current.data?.pages.flatMap((page) => page.data).map((member) => member.id)).toEqual([1, 2, 3])
			expect(result.current.hasNextPage).toBe(false)
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
			const { result } = renderMembersHook()
			await waitFor(() => expect(result.current.isError).toBe(true))

			// Assert
			expect(result.current.error?.status).toBe(500)
			expect(result.current.error?.message).toBe("Internal Server Error")
		})
	})
})
