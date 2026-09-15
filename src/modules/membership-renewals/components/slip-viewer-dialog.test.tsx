import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SlipViewerDialog, type SlipViewerMember } from "src/modules/membership-renewals/components/slip-viewer-dialog"

function jsonResponse(status: number, body?: unknown): Response {
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

function renderDialog(member: SlipViewerMember | null = { id: 101, name: "นายสมชาย ใจดี (ชาย)" }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const view = render(
		<QueryClientProvider client={client}>
			<SlipViewerDialog member={member} onClose={() => {}} />
		</QueryClientProvider>
	)
	return { ...view, client }
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("SlipViewerDialog", () => {
	describe("Happy cases", () => {
		test("fetches the member's latest renewal and renders the presigned slip image", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				expect(String(input)).toBe("/api/v1/membership/renewals/101")
				return jsonResponse(200, DETAIL_BODY)
			})
			vi.stubGlobal("fetch", fetchMock)

			renderDialog()
			const image = await screen.findByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })
			expect(image.getAttribute("src")).toBe("https://presigned.example/slip-a.png")
			expect(screen.getByText(/วันที่ทำรายการ:/).textContent).toContain("10 ก.ย. 2569")
		})

		test("recovers an expired presigned image by refetching a fresh URL", async () => {
			let slipUrl = "https://presigned.example/slip-a.png"
			const fetchMock = vi.fn(async () => jsonResponse(200, { ...DETAIL_BODY, renewal: { ...DETAIL_BODY.renewal, payment_slip: slipUrl } }))
			vi.stubGlobal("fetch", fetchMock)

			renderDialog()
			const image = await screen.findByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })

			// The 1-hour presigned URL expires — the browser fires the img error.
			fireEvent.error(image)
			expect(await screen.findByText("รูปสลิปหมดอายุ")).toBeTruthy()

			// ลองใหม่ refetches the detail and renders the fresh URL.
			slipUrl = "https://presigned.example/slip-b.png"
			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			await waitFor(async () => {
				const refreshed = screen.getByRole("img", { name: /สลิปการโอนเงินของ นายสมชาย ใจดี/ })
				expect(refreshed.getAttribute("src")).toBe("https://presigned.example/slip-b.png")
			})
		})

		test("closed dialog (member null) issues no fetch", async () => {
			const fetchMock = vi.fn()
			vi.stubGlobal("fetch", fetchMock)

			renderDialog(null)
			expect(screen.queryByRole("dialog")).toBeNull()
			await new Promise((resolve) => setTimeout(resolve, 10))
			expect(fetchMock).not.toHaveBeenCalled()
		})
	})

	describe("Unhappy cases", () => {
		test("fetch failure shows the destructive alert with the server message and a retry", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(404, { error_message: "Member or renewal not found" }))
			)
			renderDialog()

			expect(await screen.findByText("โหลดหลักฐานการโอนเงินไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("Member or renewal not found")).toBeTruthy()
			expect(screen.getByRole("button", { name: /ลองใหม่/ })).toBeTruthy()
		})
	})
})
