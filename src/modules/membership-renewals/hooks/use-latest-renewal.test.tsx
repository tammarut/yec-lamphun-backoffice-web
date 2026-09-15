import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useLatestRenewal } from "src/modules/membership-renewals/hooks/use-latest-renewal"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderDetailHook(memberId: number | null) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useLatestRenewal(memberId), { wrapper }), client }
}

const DETAIL_BODY = {
	id: 101,
	profile_avatar: null,
	title_name_th: "นาย",
	first_name_th: "สมชาย",
	last_name_th: "ใจดี",
	nickname: "ชาย",
	phone_no: "081-234-5678",
	position: "GENERAL_MEMBER",
	business: { name: "ร้านสมชายการค้า" },
	renewal: {
		id: 9001,
		payment_date_at: "2026-09-10T03:30:00.000Z",
		payment_slip: "https://presigned.example/slip.png",
		rejection_reason: null,
		rejected_at: null,
	},
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useLatestRenewal", () => {
	describe("Happy cases", () => {
		test("disabled while no member is selected — no fetch goes out", async () => {
			const fetchMock = vi.fn()
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderDetailHook(null)
			expect(result.current.isEnabled).toBe(false)
			await new Promise((resolve) => setTimeout(resolve, 10))
			expect(fetchMock).not.toHaveBeenCalled()
		})

		test("fetches the member's latest renewal from the exact URL when enabled", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/membership/renewals/101")
				return jsonResponse(200, DETAIL_BODY)
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderDetailHook(101)
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(result.current.data?.renewal.payment_slip).toBe("https://presigned.example/slip.png")
			expect(result.current.data?.business.name).toBe("ร้านสมชายการค้า")
		})

		test("keys per member so opening a different member fetches fresh", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				return jsonResponse(200, { ...DETAIL_BODY, id: url.endsWith("/102") ? 102 : 101 })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result, rerender } = renderHook(({ memberId }: { memberId: number | null }) => useLatestRenewal(memberId), {
				wrapper: ({ children }: { children: ReactNode }) => {
					const fresh = new QueryClient({ defaultOptions: { queries: { retry: false } } })
					return <QueryClientProvider client={fresh}>{children}</QueryClientProvider>
				},
				initialProps: { memberId: 101 as number | null },
			})
			await waitFor(() => expect(result.current.data?.id).toBe(101))

			rerender({ memberId: 102 })
			await waitFor(() => expect(result.current.data?.id).toBe(102))
			expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/v1/membership/renewals/101", "/api/v1/membership/renewals/102"])
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces a 404 with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(404, { error_message: "Member or renewal not found" }))
			)
			const { result } = renderDetailHook(101)
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(404)
			expect(result.current.error?.message).toBe("Member or renewal not found")
		})
	})
})
