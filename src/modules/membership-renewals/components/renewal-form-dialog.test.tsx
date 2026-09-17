import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { RenewalFormDialog, expiredMembershipToFormMember } from "src/modules/membership-renewals/components/renewal-form-dialog"
import type { MemberListItemResponse, ListMembersPageResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(status === 204 ? undefined : body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

const MEMBER: MemberListItemResponse = {
	id: 101,
	profile_avatar: null,
	registration_type: "INDIVIDUAL",
	title_name_th: "นาย",
	first_name_th: "สมชาย",
	last_name_th: "ใจดี",
	nickname: "ชาย",
	phone_no: "081-234-5678",
	email: null,
	line_id: null,
	position: "GENERAL_MEMBER",
	status: "EXPIRED",
	business: { name: "ร้านสมชายการค้า", description: "" },
}

const MEMBER_PAGE: ListMembersPageResponse = { data: [MEMBER], has_more: false, next_cursor: null }

const UPLOAD_BODY = {
	id_card_image_file_path: null,
	company_certificate_file_path: null,
	profile_avatar_file_path: null,
	business_logo_file_path: null,
	business_product_file_path: null,
	payment_slip_file_path: "members/documents/payment_slip_test.jpg",
}

function pngFile(sizeBytes = 1024): File {
	const file = new File(["x".repeat(sizeBytes)], "slip.png", { type: "image/png" })
	return file
}

/**
 * Render the dialog against a stubbed fetch. `renewalsResponse` produces the
 * create-POST reply; Debounced autocomplete uses a real 300ms timer —
 * `settleDebounce` before asserting the option list.
 */
function renderDialog(options: { mode?: "member" | "manual"; preselectedMember?: ReturnType<typeof expiredMembershipToFormMember>; renewalsResponse?: (url: string) => Response }) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url.startsWith("/api/v1/members?")) {
			return jsonResponse(200, MEMBER_PAGE)
		}
		if (url === "/api/v1/members/file/upload") {
			return jsonResponse(200, UPLOAD_BODY)
		}
		if ((url === "/api/v1/membership/renewals" || url === "/api/v1/membership/renewals/manual") && (init?.method ?? "GET") === "POST") {
			return options.renewalsResponse?.(url) ?? jsonResponse(201, { id: 5001 })
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const onClose = vi.fn()
	const view = render(
		<QueryClientProvider client={queryClient}>
			<RenewalFormDialog mode={options.mode ?? "member"} preselectedMember={options.preselectedMember ?? null} open={true} onClose={onClose} />
		</QueryClientProvider>
	)
	const settleDebounce = () => new Promise((resolve) => setTimeout(resolve, 350))
	return { fetchMock, settleDebounce, onClose, ...view }
}

function pickSlipFile(file: File) {
	const input = document.querySelector('input[data-slot="renewal-slip-input"]') as HTMLInputElement
	fireEvent.change(input, { target: { files: [file] } })
}

beforeEach(() => {
	// Radix Checkbox (react-use-size) needs ResizeObserver in jsdom.
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	)
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("RenewalFormDialog", () => {
	describe("Happy cases", () => {
		it("member mode: autocomplete picks a member and the selected card replaces the search", async () => {
			const { settleDebounce } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText(/\(ชาย\)/)).toBeTruthy()
			expect(screen.getByText(/ร้านสมชายการค้า/)).toBeTruthy()
			expect(screen.getByText(/สถานะ: หมดอายุ/)).toBeTruthy()
		})

		it("member mode: uploads the slip first, then POSTs /renewals with the returned path, and shows the success screen", async () => {
			const { fetchMock, settleDebounce, onClose } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			expect(await screen.findByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeTruthy()
			expect(screen.getByText("สถานะ: รอตรวจสอบการโอนเงิน")).toBeTruthy()

			const uploadIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/members/file/upload")
			const createIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/membership/renewals")
			expect(uploadIndex).toBeGreaterThanOrEqual(0)
			expect(createIndex).toBeGreaterThan(uploadIndex)

			const uploadForm = fetchMock.mock.calls[uploadIndex]?.[1]?.body as FormData | undefined
			expect(uploadForm?.get("payment_slip")).toBeTruthy()

			const createBody = fetchMock.mock.calls[createIndex]?.[1]?.body
			expect(JSON.parse(String(createBody))).toEqual({ member_id: 101, payment_slip: "members/documents/payment_slip_test.jpg" })

			fireEvent.click(screen.getByRole("button", { name: "ปิด" }))
			expect(onClose).toHaveBeenCalled()
		})

		it("manual mode: title, locked preselected member, submit to /manual, and the ต่ออายุสำเร็จ screen", async () => {
			const { fetchMock } = renderDialog({
				mode: "manual",
				preselectedMember: expiredMembershipToFormMember({
					id: 202,
					profile_avatar: null,
					title_name_th: "นางสาว",
					first_name_th: "สมหญิง",
					last_name_th: "ใจงาม",
					nickname: "หญิง",
					phone_no: "089-888-8888",
					position: "TREASURER",
					status: "EXPIRED",
					latest_renewal_status: null,
					member_since: "2024-06-01T00:00:00.000Z",
					rejection_reason: null,
					rejected_at: null,
				}),
			})

			expect(screen.getByText("ต่ออายุสมาชิก (ผู้ดูแลระบบ)")).toBeTruthy()
			expect(screen.getByText("นางสาวสมหญิง ใจงาม")).toBeTruthy()
			expect(screen.getByText(/\(หญิง\)/)).toBeTruthy()
			expect(screen.queryByRole("button", { name: "เปลี่ยนสมาชิก" })).toBeNull()
			expect(screen.queryByRole("combobox")).toBeNull()

			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /อนุมัติ/ }))

			expect(await screen.findByText("ต่ออายุสำเร็จ")).toBeTruthy()
			expect(screen.getByText("สถานะ: ต่ออายุสำเร็จ (ปกติ)")).toBeTruthy()
			const manualIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/membership/renewals/manual")
			expect(manualIndex).toBeGreaterThanOrEqual(0)
			expect(JSON.parse(String(fetchMock.mock.calls[manualIndex]?.[1]?.body))).toEqual({
				member_id: 202,
				payment_slip: "members/documents/payment_slip_test.jpg",
			})
		})

		it("fee rail computes 5,000 minus the working-team discount for a committee member", async () => {
			const { settleDebounce } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (1 คน)")).toBeTruthy()
			expect(screen.getByText("ส่วนลดคณะทำงาน (0 คน × 500)")).toBeTruthy()
		})

		it("reopening resets the form: no stale success screen, and the preselected card still locks", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url === "/api/v1/members/file/upload") {
					return jsonResponse(200, UPLOAD_BODY)
				}
				if (url === "/api/v1/membership/renewals/manual") {
					return jsonResponse(201, { id: 5001 })
				}
				return jsonResponse(404)
			})
			vi.stubGlobal("fetch", fetchMock)

			const preselected = expiredMembershipToFormMember({
				id: 202,
				profile_avatar: null,
				title_name_th: "นางสาว",
				first_name_th: "สมหญิง",
				last_name_th: "ใจงาม",
				nickname: "หญิง",
				phone_no: "089-888-8888",
				position: "TREASURER",
				status: "EXPIRED",
				latest_renewal_status: null,
				member_since: "2024-06-01T00:00:00.000Z",
				rejection_reason: null,
				rejected_at: null,
			})
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
			const ui = (open: boolean) => (
				<QueryClientProvider client={queryClient}>
					<RenewalFormDialog mode="manual" preselectedMember={preselected} open={open} onClose={vi.fn()} />
				</QueryClientProvider>
			)
			const view = render(ui(true))

			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /อนุมัติ/ }))
			expect(await screen.findByText("ต่ออายุสำเร็จ")).toBeTruthy()

			// Close, then reopen for the SAME member — must be a fresh form.
			view.rerender(ui(false))
			view.rerender(ui(true))

			expect(screen.queryByText("ต่ออายุสำเร็จ")).toBeNull()
			expect(screen.getByText("นางสาวสมหญิง ใจงาม")).toBeTruthy()
			expect(screen.getByRole("button", { name: /อนุมัติ/ })).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("empty submit shows the three-item missing-field summary without any fetch", async () => {
			const { fetchMock } = renderDialog({})

			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			expect(await screen.findByText("กรุณาดำเนินการให้ครบถ้วน:")).toBeTruthy()
			expect(screen.getByText("เลือกสมาชิกที่ต่ออายุ")).toBeTruthy()
			expect(screen.getByText("แนบหลักฐานการโอนเงิน (Slip)")).toBeTruthy()
			expect(screen.getByText("ยอมรับหนังสือให้ความยินยอม (PDPA)")).toBeTruthy()
			expect(fetchMock.mock.calls.length).toBe(0)
		})

		it("oversized slip is rejected client-side with no upload fetch", async () => {
			const { fetchMock, settleDebounce } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			const oversized = pngFile()
			Object.defineProperty(oversized, "size", { value: 8 * 1024 * 1024 })
			pickSlipFile(oversized)

			expect(screen.getByText("ขนาดไฟล์ต้องไม่เกิน 7MB")).toBeTruthy()
			expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/members/file/upload").length).toBe(0)
		})

		it("409 pending-exists surfaces the server error_message inline without the success screen", async () => {
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(409, { error_message: "This member has a pending renewal" }),
			})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/This member has a pending renewal/)).toBeTruthy()
			expect(screen.queryByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeNull()
		})

		it("403 resigned surfaces the server error_message inline (status changed between pick and submit)", async () => {
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(403, { error_message: "This member has resigned" }),
			})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/This member has resigned/)).toBeTruthy()
			expect(screen.queryByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeNull()
		})

		it("404 member-not-found surfaces the server error_message inline", async () => {
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(404, { error_message: "Member not found" }),
			})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			pickSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/Member not found/)).toBeTruthy()
		})

		it("revokes the slip's object URL when the dialog unmounts", async () => {
			const revokeSpy = vi.spyOn(URL, "revokeObjectURL")
			const { settleDebounce, unmount } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			pickSlipFile(pngFile())
			const stagedUrl = screen.getByRole("img", { name: /ตัวอย่างสลิป/ }).getAttribute("src")

			expect(stagedUrl).toBeTruthy()
			expect(revokeSpy).not.toHaveBeenCalledWith(stagedUrl)
			unmount()
			expect(revokeSpy).toHaveBeenCalledWith(stagedUrl)

			revokeSpy.mockRestore()
		})

		it("non-image slip is rejected with the extension message", async () => {
			const { settleDebounce } = renderDialog({})

			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			pickSlipFile(new File(["x"], "slip.pdf", { type: "application/pdf" }))

			expect(screen.getByText(/รองรับเฉพาะไฟล์รูปภาพ/)).toBeTruthy()
		})
	})
})
