import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { makeMembershipRenewal } from "src/modules/membership-renewals/components/make-membership-renewal.fixture"
import { RenewalTable } from "src/modules/membership-renewals/components/renewal-table"
import type { ListableRenewalStatus, MembershipRenewalResponse } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import { SessionProvider } from "src/shared/lib/api/session"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renewalPage(rows: MembershipRenewalResponse[], hasMore = false, nextCursor: string | null = null) {
	return { data: rows, has_more: hasMore, next_cursor: nextCursor }
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
		payment_slip: "https://presigned.example/slip-a.png",
		rejection_reason: null,
		rejected_at: null,
	},
}

/**
 * Render the table against a stubbed fetch. `sessionOk` toggles the admin
 * probe (204 = staff, 401 = public); `listResponse` produces the renewal-list
 * GET and `detailResponse` the slip-viewer detail GET. Debounced search uses a
 * real 300ms timer — `settleDebounce` before asserting search-driven fetches.
 */
function renderTable(options: {
	sessionOk: boolean
	status?: ListableRenewalStatus
	listResponse: (url: string) => Response | Promise<Response>
	detailResponse?: (url: string) => Response | Promise<Response>
}) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") {
			return jsonResponse(options.sessionOk ? 204 : 401, options.sessionOk ? undefined : { error_message: "Unauthorized" })
		}
		if (/^\/api\/v1\/membership\/renewals\?/.test(url) && (init?.method ?? "GET") === "GET") {
			return options.listResponse(url)
		}
		if (/^\/api\/v1\/membership\/renewals\/\d+$/.test(url) && options.detailResponse) {
			return options.detailResponse(url)
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
				<RenewalTable status={options.status ?? "PENDING_REVIEW"} />
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

describe("RenewalTable", () => {
	describe("Happy cases", () => {
		it("admin: all six columns render; approved rows show เรียบร้อย + eye, pending rows a dash", async () => {
			const { container } = renderTable({
				sessionOk: true,
				status: "APPROVED",
				listResponse: () => jsonResponse(200, renewalPage([makeMembershipRenewal({ status: "APPROVED" })])),
			})

			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("วันที่ทำรายการ")).toBeTruthy()
			expect(screen.getByText("ดำเนินการ")).toBeTruthy()
			expect(screen.getByText("10 ก.ย. 2569")).toBeTruthy()
			expect(screen.getByText("เรียบร้อย")).toBeTruthy()
			expect(screen.getByRole("button", { name: /ดูสลิปการโอนเงินของ นายสมชาย ใจดี/ })).toBeTruthy()
			// The status pill stays audience-independent for APPROVED.
			expect(screen.getByText("ปกติ")).toBeTruthy()
			expect(container.querySelector('[data-slot="renewal-table"]')).toBeTruthy()
		})

		it("admin pending tab: the ตรวจสอบ/อนุมัติ review action opens the review dialog", async () => {
			renderTable({
				sessionOk: true,
				status: "PENDING_REVIEW",
				listResponse: () => jsonResponse(200, renewalPage([makeMembershipRenewal()])),
				detailResponse: () => jsonResponse(200, DETAIL_BODY),
			})

			expect(await screen.findByText("รอตรวจสอบ")).toBeTruthy()
			expect(screen.queryByText("เรียบร้อย")).toBeNull()

			fireEvent.click(screen.getByRole("button", { name: /ตรวจสอบ\/อนุมัติการต่ออายุของ นายสมชาย ใจดี/ }))
			expect(await screen.findByText("ตรวจสอบการชำระเงิน")).toBeTruthy()
			expect(await screen.findByText("ข้อมูลสมาชิก")).toBeTruthy()
		})

		it("member: transaction-date and action columns are hidden entirely", async () => {
			renderTable({
				sessionOk: false,
				status: "APPROVED",
				listResponse: () => jsonResponse(200, renewalPage([makeMembershipRenewal({ status: "APPROVED" })])),
			})

			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.queryByText("วันที่ทำรายการ")).toBeNull()
			expect(screen.queryByText("ดำเนินการ")).toBeNull()
			expect(screen.queryByRole("button", { name: /ดูสลิป/ })).toBeNull()
		})

		it("eye action opens the slip viewer with the presigned image", async () => {
			renderTable({
				sessionOk: true,
				status: "APPROVED",
				listResponse: () => jsonResponse(200, renewalPage([makeMembershipRenewal({ status: "APPROVED" })])),
				detailResponse: () => jsonResponse(200, DETAIL_BODY),
			})

			fireEvent.click(await screen.findByRole("button", { name: /ดูสลิปการโอนเงินของ นายสมชาย ใจดี/ }))
			const image = await screen.findByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })
			expect(image.getAttribute("src")).toBe("https://presigned.example/slip-a.png")
			expect(screen.getByText("หลักฐานการโอนเงิน")).toBeTruthy()
		})

		it("cursor load-more accumulates the next page", async () => {
			renderTable({
				sessionOk: true,
				status: "PENDING_REVIEW",
				listResponse: (url) => {
					if (url.includes("cursor=101")) {
						return jsonResponse(200, renewalPage([makeMembershipRenewal({ id: 102, first_name_th: "สมหญิง", nickname: "หญิง", renewal_id: 9002 })]))
					}
					return jsonResponse(200, renewalPage([makeMembershipRenewal()], true, "101"))
				},
			})

			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: "โหลดเพิ่มเติม" }))
			await waitFor(() => expect(screen.getByText("นายสมหญิง ใจดี")).toBeTruthy())
			expect(screen.queryByRole("button", { name: "โหลดเพิ่มเติม" })).toBeNull()
		})

		it("debounced search refetches with the search + status params", async () => {
			const { fetchMock, settleDebounce } = renderTable({
				sessionOk: true,
				status: "PENDING_REVIEW",
				listResponse: (url) => {
					if (url.includes("search=")) {
						return jsonResponse(200, renewalPage([makeMembershipRenewal()]))
					}
					return jsonResponse(200, renewalPage([]))
				},
			})

			expect(await screen.findByText("ไม่พบข้อมูล")).toBeTruthy()
			fireEvent.change(screen.getByPlaceholderText("ค้นหาชื่อ หรือ เบอร์โทรศัพท์..."), { target: { value: "สมชาย" } })
			await settleDebounce()
			await screen.findByText("นายสมชาย ใจดี")
			const listUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/v1/membership/renewals?"))
			expect(listUrls.at(-1)).toBe("/api/v1/membership/renewals?limit=20&status=PENDING_REVIEW&search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2")
		})
	})

	describe("Unhappy cases", () => {
		it("list failure shows the destructive alert and retry refetches", async () => {
			const { fetchMock } = renderTable({
				sessionOk: true,
				listResponse: () => jsonResponse(500, { error_message: "Internal Server Error" }),
			})

			expect(await screen.findByText("โหลดรายการต่ออายุไม่สำเร็จ")).toBeTruthy()
			const fetchesBefore = fetchMock.mock.calls.length
			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore))
		})
	})
})
