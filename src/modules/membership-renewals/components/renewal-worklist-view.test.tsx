import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { RenewalWorklistView } from "src/modules/membership-renewals/components/renewal-worklist-view"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { SessionProvider } from "src/shared/lib/api/session"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function expiredPage(members: ExpiredMembershipResponse[], hasMore = false, nextCursor: string | null = null) {
	return { data: members, has_more: hasMore, next_cursor: nextCursor }
}

function rejectedRow(overrides: Partial<ExpiredMembershipResponse> = {}) {
	return makeExpiredMembership({
		latest_renewal_status: "REJECTED",
		rejection_reason: "สลิปไม่ชัดเจน กรุณาส่งใหม่",
		rejected_at: "2026-08-12T00:00:00.000Z",
		...overrides,
	})
}

/**
 * Render the worklist against a stubbed fetch. `sessionOk` toggles the admin
 * probe (204 = staff, 401 = public); `expiredResponse` produces the expired
 * GET. Debounced search uses a real 300ms timer — use the `settleDebounce`
 * helper before asserting search-driven renders.
 */
function renderView(options: { sessionOk: boolean; expiredResponse: (url: string) => Response | Promise<Response> }) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") {
			return jsonResponse(options.sessionOk ? 204 : 401, options.sessionOk ? undefined : { error_message: "Unauthorized" })
		}
		if (url.startsWith("/api/v1/membership/renewals/expired") && (init?.method ?? "GET") === "GET") {
			return options.expiredResponse(url)
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const view = render(
		<QueryClientProvider client={queryClient}>
			<SessionProvider>
				<RenewalWorklistView />
			</SessionProvider>
		</QueryClientProvider>
	)
	const settleDebounce = () => new Promise((resolve) => setTimeout(resolve, 350))
	return { fetchMock, settleDebounce, ...view }
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("RenewalWorklistView", () => {
	describe("Happy cases", () => {
		it("admin: rejected panel on top with เหตุผล lines, expired table below with member_since", async () => {
			const { container } = renderView({
				sessionOk: true,
				expiredResponse: () => jsonResponse(200, expiredPage([rejectedRow(), makeExpiredMembership({ id: 202, first_name_th: "สมหญิง", nickname: "หญิง" })])),
			})

			expect(await screen.findByText("ไม่อนุมัติ — ต้องติดตาม")).toBeTruthy()
			const panelHeader = screen.getByRole("button", { name: /ไม่อนุมัติ — ต้องติดตาม/ })
			expect(within(panelHeader).getByText("1 ราย")).toBeTruthy()
			expect(screen.getByText("สลิปไม่ชัดเจน กรุณาส่งใหม่")).toBeTruthy()
			expect(screen.getAllByText("12 ส.ค. 2569")).toHaveLength(1)
			expect(screen.getByText("หมดอายุ — ยังไม่แจ้งต่ออายุ")).toBeTruthy()
			const expiredSection = container.querySelector('[data-slot="expired-members-section"]')
			expect(expiredSection).toBeTruthy()
			// The หมดอายุ badge was removed (Antigravity Nit 1): a client-accumulated
			// count reads as a total, which keyset pagination cannot promise. The
			// PR 2b stat card owns the authoritative number.
			expect(within(expiredSection as HTMLElement).queryByText(/ราย/)).toBeNull()
			expect(screen.getByText("นายสมหญิง ใจดี")).toBeTruthy()
			expect(screen.getByText("1 มิ.ย. 2567")).toBeTruthy()
		})

		it("member: contact-staff pill wording and no เหตุผล line", async () => {
			renderView({
				sessionOk: false,
				expiredResponse: () => jsonResponse(200, expiredPage([rejectedRow()])),
			})

			expect(await screen.findByText("ไม่อนุมัติ — กรุณาติดต่อเจ้าหน้าที่")).toBeTruthy()
			expect(screen.queryByText(/เหตุผล:/)).toBeNull()
			expect(screen.queryByText("สลิปไม่ชัดเจน กรุณาส่งใหม่")).toBeNull()
		})

		it("no rejected rows: green all-clear panel above the expired table", async () => {
			renderView({
				sessionOk: true,
				expiredResponse: () => jsonResponse(200, expiredPage([makeExpiredMembership()])),
			})

			expect(await screen.findByText("จัดการคำขอทั้งหมดแล้ว")).toBeTruthy()
			expect(screen.getByText("0 ราย")).toBeTruthy()
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
		})

		it("+10 reveal paging shows the first 10 expired rows and the remaining count", async () => {
			const expired = Array.from({ length: 12 }, (_, index) => makeExpiredMembership({ id: 300 + index }))
			renderView({
				sessionOk: true,
				expiredResponse: () => jsonResponse(200, expiredPage(expired)),
			})

			await waitFor(() => {
				expect(screen.getAllByText(/ใจดี$/)).toHaveLength(10)
			})
			const visibleNames = () => screen.getAllByText(/ใจดี$/).length
			expect(visibleNames()).toBe(10)
			expect(screen.getByText("แสดงเพิ่มเติม (เหลืออีก 2 ราย)")).toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: /แสดงเพิ่มเติม/ }))
			expect(visibleNames()).toBe(12)
			expect(screen.queryByRole("button", { name: /แสดงเพิ่มเติม/ })).toBeNull()
		})

		it("cursor load-more fetches the next page and disappears when has_more is false", async () => {
			const state = { page: 0 }
			renderView({
				sessionOk: true,
				expiredResponse: () => {
					state.page += 1
					const hasMore = state.page === 1
					return jsonResponse(200, expiredPage([makeExpiredMembership({ id: state.page })], hasMore, hasMore ? String(state.page) : null))
				},
			})

			expect(await screen.findByRole("button", { name: "โหลดเพิ่มเติม" })).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: "โหลดเพิ่มเติม" }))
			await waitFor(() => {
				expect(screen.queryByRole("button", { name: "โหลดเพิ่มเติม" })).toBeNull()
			})
		})

		it("searching sends the term, hides the +10 reveal, and re-expands the rejected panel", async () => {
			const expired = Array.from({ length: 12 }, (_, index) => makeExpiredMembership({ id: 400 + index }))
			const { settleDebounce, fetchMock, container } = renderView({
				sessionOk: true,
				expiredResponse: (url) => {
					const search = new URLSearchParams(url.split("?")[1] ?? "").get("search")
					if (search !== null) {
						return jsonResponse(200, expiredPage([rejectedRow({ id: 999 })]))
					}
					return jsonResponse(200, expiredPage(expired))
				},
			})

			await waitFor(() => {
				expect(screen.getAllByText(/ใจดี$/).length).toBeGreaterThan(0)
			})

			// Collapse the panel first — searching must re-expand it.
			fireEvent.click(screen.getByRole("button", { name: /ไม่อนุมัติ — ต้องติดตาม/ }))
			expect(container.querySelector('[data-slot="rejected-renewal-rows"]')).toBeNull()

			fireEvent.change(screen.getByPlaceholderText("ค้นหาชื่อ หรือ เบอร์โทรศัพท์..."), {
				target: { value: "สมชาย" },
			})
			await settleDebounce()
			await waitFor(() => {
				expect(fetchMock.mock.calls.some(([url]) => String(url).includes("search="))).toBe(true)
			})
			await waitFor(() => {
				expect(container.querySelector('[data-slot="rejected-renewal-rows"]')).toBeTruthy()
			})
			expect(screen.queryByRole("button", { name: /แสดงเพิ่มเติม/ })).toBeNull()
		})
	})

	describe("Unhappy cases", () => {
		it("error renders the alert with a retry button that refetches", async () => {
			let failing = true
			renderView({
				sessionOk: false,
				expiredResponse: () => (failing ? jsonResponse(500, { error_message: "Internal Server Error" }) : jsonResponse(200, expiredPage([]))),
			})

			expect(await screen.findByText("โหลดรายการต่ออายุไม่สำเร็จ")).toBeTruthy()

			failing = false
			fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }))
			expect(await screen.findByText("ไม่พบข้อมูล")).toBeTruthy()
		})

		it("empty result renders the green all-clear panel and the table empty row", async () => {
			renderView({
				sessionOk: true,
				expiredResponse: () => jsonResponse(200, expiredPage([])),
			})

			expect(await screen.findByText("จัดการคำขอทั้งหมดแล้ว")).toBeTruthy()
			expect(screen.getByText("ไม่พบข้อมูล")).toBeTruthy()
		})

		it("loading renders the skeleton before data arrives", async () => {
			let release: (() => void) | undefined
			const gate = new Promise<void>((resolve) => {
				release = resolve
			})
			const { container } = renderView({
				sessionOk: true,
				expiredResponse: () => {
					void gate
					return new Promise(() => {}) // hang until unmounted
				},
			})

			expect(container.querySelector('[data-slot="renewal-worklist-skeleton"]')).toBeTruthy()
			release?.()
		})
	})
})
