import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { ReviewDialog, type ReviewDialogTarget } from "src/modules/membership-renewals/components/review-dialog"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
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

const PENDING_TARGET: ReviewDialogTarget = { memberId: 101, renewalId: 9001, name: "นายสมชาย ใจดี (ชาย)", state: "PENDING_REVIEW" }
const REJECTED_TARGET: ReviewDialogTarget = { memberId: 101, name: "นายสมชาย ใจดี (ชาย)", state: "REJECTED" }

function renderDialog(options: { target: ReviewDialogTarget | null; detailResponse?: (url: string) => Response; reviewResponse?: (url: string) => Response }) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (/^\/api\/v1\/membership\/renewals\/\d+$/.test(url) && (init?.method ?? "GET") === "GET") {
			return options.detailResponse?.(url) ?? jsonResponse(200, DETAIL_BODY)
		}
		if (/^\/api\/v1\/membership\/renewals\/review\/\d+$/.test(url) && init?.method === "PATCH") {
			return options.reviewResponse?.(url) ?? jsonResponse(204)
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const onClose = vi.fn()
	render(
		<QueryClientProvider client={queryClient}>
			<ReviewDialog target={options.target} onClose={onClose} />
		</QueryClientProvider>
	)
	return { fetchMock, onClose }
}

function patchCalls(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/review/") && init?.method === "PATCH")
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("ReviewDialog", () => {
	describe("Happy cases", () => {
		it("pending state: ตรวจสอบการชำระเงิน title, member grid, and the presigned slip", async () => {
			renderDialog({ target: PENDING_TARGET })

			expect(await screen.findByText("ตรวจสอบการชำระเงิน")).toBeTruthy()
			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText(/ร้านสมชายการค้า/)).toBeTruthy()
			expect(screen.getByText("081-234-5678")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			const image = screen.getByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })
			expect(image.getAttribute("src")).toBe("https://presigned.example/slip-a.png")
		})

		it("approve PATCHes APPROVED and closes the dialog", async () => {
			const { fetchMock, onClose } = renderDialog({ target: PENDING_TARGET })

			fireEvent.click(await screen.findByRole("button", { name: "อนุมัติ" }))

			await waitFor(() => expect(onClose).toHaveBeenCalled())
			const calls = patchCalls(fetchMock)
			expect(calls.length).toBe(1)
			expect(String(calls[0]?.[0])).toBe("/api/v1/membership/renewals/review/9001")
			expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ status: "APPROVED" })
		})

		it("reject flow gates the confirm on a non-blank reason and PATCHes it", async () => {
			const { fetchMock, onClose } = renderDialog({ target: PENDING_TARGET })

			fireEvent.click(await screen.findByRole("button", { name: "ไม่อนุมัติ" }))
			const confirm = await screen.findByRole("button", { name: "ยืนยันไม่อนุมัติ" })
			expect((confirm as HTMLButtonElement).disabled).toBe(true)

			fireEvent.change(screen.getByPlaceholderText("เช่น สลิปไม่ชัดเจน, ยอดเงินไม่ถูกต้อง..."), { target: { value: "สลิปไม่ชัดเจน" } })
			expect((confirm as HTMLButtonElement).disabled).toBe(false)
			fireEvent.click(confirm)

			await waitFor(() => expect(onClose).toHaveBeenCalled())
			const calls = patchCalls(fetchMock)
			expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ status: "REJECTED", reason: "สลิปไม่ชัดเจน" })
		})

		it("rejected state: read-only title, the reason + date, and ปิดหน้าต่าง", async () => {
			const { onClose } = renderDialog({
				target: REJECTED_TARGET,
				detailResponse: () =>
					jsonResponse(200, {
						...DETAIL_BODY,
						renewal: { ...DETAIL_BODY.renewal, rejection_reason: "ยอดเงินไม่ถูกต้อง", rejected_at: "2026-09-12T00:00:00.000Z" },
					}),
			})

			expect(await screen.findByText("คำขอต่ออายุที่ไม่อนุมัติ")).toBeTruthy()
			expect(await screen.findByText("เหตุผลที่ไม่อนุมัติ (เมื่อ 12 ก.ย. 2569)")).toBeTruthy()
			expect(screen.getByText("ยอดเงินไม่ถูกต้อง")).toBeTruthy()
			expect(screen.queryByRole("button", { name: "อนุมัติ" })).toBeNull()

			fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }))
			expect(onClose).toHaveBeenCalled()
		})

		it("expired slip preview recovers by refetching the detail", async () => {
			const { fetchMock } = renderDialog({ target: PENDING_TARGET })

			const image = await screen.findByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })
			const detailGetsBefore = fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/renewals/101") && init?.method === undefined).length
			fireEvent.error(image)

			expect(await screen.findByText("รูปสลิปหมดอายุ")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			await waitFor(() => {
				const detailGets = fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/renewals/101") && init?.method === undefined).length
				expect(detailGets).toBeGreaterThan(detailGetsBefore)
			})
		})
	})

	describe("Unhappy cases", () => {
		it("409 already-reviewed surfaces inline and keeps the dialog open", async () => {
			const { onClose } = renderDialog({
				target: PENDING_TARGET,
				reviewResponse: () => jsonResponse(409, { error_message: "This renewal has been reviewed" }),
			})

			fireEvent.click(await screen.findByRole("button", { name: "อนุมัติ" }))

			expect(await screen.findByText("บันทึกการตรวจสอบไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/This renewal has been reviewed/)).toBeTruthy()
			expect(onClose).not.toHaveBeenCalled()
		})

		it("detail fetch failure shows the destructive alert and retry refetches", async () => {
			const { fetchMock } = renderDialog({
				target: PENDING_TARGET,
				detailResponse: () => jsonResponse(500, { error_message: "Internal Server Error" }),
			})

			expect(await screen.findByText("โหลดข้อมูลการต่ออายุไม่สำเร็จ")).toBeTruthy()
			const fetchesBefore = fetchMock.mock.calls.length
			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBefore))
		})
	})
})
