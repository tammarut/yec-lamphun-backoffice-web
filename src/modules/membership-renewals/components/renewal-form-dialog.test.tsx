import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { RenewalFormDialog, expiredMembershipToFormMember } from "src/modules/membership-renewals/components/renewal-form-dialog"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
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

/** Fixture factory over MEMBER's shape — id/name/business/position overrides only. */
function memberFixture(overrides: Partial<MemberListItemResponse> & Pick<MemberListItemResponse, "id" | "first_name_th" | "last_name_th">): MemberListItemResponse {
	return {
		...MEMBER,
		nickname: "",
		phone_no: "080-000-0000",
		...overrides,
	}
}

/** Working-team member (position ≠ GENERAL_MEMBER) from the MAIN member's business — earns the −500 discount. */
const MEMBER_COMMITTEE = memberFixture({ id: 102, first_name_th: "สมศรี", last_name_th: "ใจสู้", nickname: "ศรี", position: "PRESIDENT" })
/** General member from a DIFFERENT business — triggers the amber cross-business warning. */
const MEMBER_OTHER_BIZ = memberFixture({ id: 103, first_name_th: "สมหมาย", last_name_th: "ใจเร็ว", business: { name: "กิจการอื่น จำกัด", description: "" } })
const MEMBER_104 = memberFixture({ id: 104, first_name_th: "สมพร", last_name_th: "ใจเย็น" })
const MEMBER_105 = memberFixture({ id: 105, first_name_th: "สมควร", last_name_th: "ใจดำ" })
const MEMBER_106 = memberFixture({ id: 106, first_name_th: "สมดี", last_name_th: "ใจงาม" })

const MEMBER_PAGE: ListMembersPageResponse = {
	data: [MEMBER, MEMBER_COMMITTEE, MEMBER_OTHER_BIZ, MEMBER_104, MEMBER_105, MEMBER_106],
	has_more: false,
	next_cursor: null,
}

/** Expired-worklist row for manual-mode tests — carries NO business name (the API gap that suppresses the ② warning). */
const MANUAL_MEMBER_ROW = {
	id: 202,
	profile_avatar: null,
	title_name_th: "นางสาว",
	first_name_th: "สมหญิง",
	last_name_th: "ใจงาม",
	nickname: "หญิง",
	phone_no: "089-888-8888",
	position: "GENERAL_MEMBER",
	status: "EXPIRED",
	latest_renewal_status: null,
	member_since: "2024-06-01T00:00:00.000Z",
	rejection_reason: null,
	rejected_at: null,
} satisfies ExpiredMembershipResponse

const UPLOAD_BODY = {
	id_card_image_file_path: null,
	company_certificate_file_path: null,
	profile_avatar_file_path: null,
	business_logo_file_path: null,
	business_product_file_path: null,
	payment_slip_file_path: "members/documents/payment_slip_test.jpg",
}

// ADR-0026 create-renewal 201 shape — solo submission (group_id null).
const CREATE_RENEWAL_BODY = {
	renewals: [{ member_id: 101, renewal_id: 5001 }],
	group_id: null,
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
			return options.renewalsResponse?.(url) ?? jsonResponse(201, CREATE_RENEWAL_BODY)
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
	const settleDebounce = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 350))
	return { fetchMock, settleDebounce, onClose, ...view }
}

function pickSlipFile(file: File) {
	const input = document.querySelector('input[data-slot="renewal-slip-input"]') as HTMLInputElement
	fireEvent.change(input, { target: { files: [file] } })
}

/** Stage a VALID slip — the data:-URL preview derives via FileReader (async), so wait for the staged state. */
async function stageSlipFile(file: File) {
	pickSlipFile(file)
	await screen.findByText(/ไฟล์ที่เลือก:/)
}

/** Search-and-pick in the ① main combobox (the only combobox while no member is selected). */
async function pickMainMember(name: RegExp, settleDebounce: () => Promise<void>) {
	fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
	await settleDebounce()
	fireEvent.click(await screen.findByRole("option", { name }))
}

/** Open ②'s dashed button, search, and pick — the ② combobox is the only one while the main card shows. */
async function pickAdditionalMember(name: RegExp, settleDebounce: () => Promise<void>) {
	fireEvent.click(screen.getByRole("button", { name: "+ เพิ่มสมาชิก" }))
	fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
	await settleDebounce()
	fireEvent.click(await screen.findByRole("option", { name }))
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
		it("member mode: autocomplete searches EXPIRED members only and the selected card replaces the search", async () => {
			// Arrange
			const { fetchMock, settleDebounce } = renderDialog({})

			// Act
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			// Assert
			const memberUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/v1/members?"))
			expect(memberUrls.at(-1)).toBe("/api/v1/members?limit=8&status=EXPIRED&search=%E0%B8%AA%E0%B8%A1")
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText(/\(ชาย\)/)).toBeTruthy()
			expect(screen.getByText(/ร้านสมชายการค้า/)).toBeTruthy()
			expect(screen.getByText(/สถานะ: หมดอายุ/)).toBeTruthy()
		})

		it("member mode: clearing the search input hides the previous results instantly (no stale rows, M2)", async () => {
			// Arrange — search, wait, and let a result render.
			const { settleDebounce } = renderDialog({})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			expect(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ })).toBeTruthy()

			// Act
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } })

			// Assert — instant, not debounce-deferred: the empty-term guard is a
			// render-time derivation over searchTerm, so the stale rows vanish this render.
			expect(screen.queryByRole("option")).toBeNull()
			expect(await screen.findByText(/พิมพ์เพื่อค้นหาสมาชิก/)).toBeTruthy()
		})

		it("member mode: uploads the slip first, then POSTs /renewals with the returned path, and shows the success screen", async () => {
			// Arrange
			const { fetchMock, settleDebounce, onClose } = renderDialog({})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))

			// Act
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			// Assert
			expect(await screen.findByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeTruthy()
			expect(screen.getByText("สถานะ: รอตรวจสอบการโอนเงิน")).toBeTruthy()

			const uploadIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/members/file/upload")
			const createIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/membership/renewals")
			expect(uploadIndex).toBeGreaterThanOrEqual(0)
			expect(createIndex).toBeGreaterThan(uploadIndex)

			const uploadForm = fetchMock.mock.calls[uploadIndex]?.[1]?.body as FormData | undefined
			expect(uploadForm?.get("payment_slip")).toBeTruthy()

			const createBody = fetchMock.mock.calls[createIndex]?.[1]?.body
			expect(JSON.parse(String(createBody))).toEqual({ member_ids: [101], payment_slip: "members/documents/payment_slip_test.jpg" })

			fireEvent.click(screen.getByRole("button", { name: "ปิด" }))
			expect(onClose).toHaveBeenCalled()
		})

		it("manual mode: title, locked preselected member, submit to /manual, and the ต่ออายุสำเร็จ screen", async () => {
			// Arrange
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

			// Assert — the locked preselected card: title, name, no member switcher.
			expect(screen.getByText("ต่ออายุสมาชิก (ผู้ดูแลระบบ)")).toBeTruthy()
			expect(screen.getByText("นางสาวสมหญิง ใจงาม")).toBeTruthy()
			expect(screen.getByText(/\(หญิง\)/)).toBeTruthy()
			expect(screen.queryByRole("button", { name: "เปลี่ยนสมาชิก" })).toBeNull()
			expect(screen.queryByRole("combobox")).toBeNull()

			// Act
			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /อนุมัติ/ }))

			// Assert
			expect(await screen.findByText("ต่ออายุสำเร็จ")).toBeTruthy()
			expect(screen.getByText("สถานะ: ต่ออายุสำเร็จ (ปกติ)")).toBeTruthy()
			const manualIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/membership/renewals/manual")
			expect(manualIndex).toBeGreaterThanOrEqual(0)
			// Both endpoints speak the SAME member_ids contract since #85 (ADR-0026) —
			// a solo submission sends the one-element array.
			expect(JSON.parse(String(fetchMock.mock.calls[manualIndex]?.[1]?.body))).toEqual({
				member_ids: [202],
				payment_slip: "members/documents/payment_slip_test.jpg",
			})
		})

		it("fee rail computes 5,000 minus the working-team discount for a committee member", async () => {
			// Arrange
			const { settleDebounce } = renderDialog({})

			// Act
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			// Assert
			expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (1 คน)")).toBeTruthy()
			expect(screen.getByText("ส่วนลดคณะทำงาน (0 คน × 500)")).toBeTruthy()
		})

		it("reopening resets the form: no stale success screen, and the preselected card still locks", async () => {
			// Arrange — submit once to reach the success screen.
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				if (url === "/api/v1/members/file/upload") {
					return jsonResponse(200, UPLOAD_BODY)
				}
				if (url === "/api/v1/membership/renewals/manual") {
					// Minimal 201 body — the ADR-0026 shape is { renewals, group_id }
					// but this flow never reads it back.
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

			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))
			fireEvent.click(screen.getByRole("button", { name: /อนุมัติ/ }))
			expect(await screen.findByText("ต่ออายุสำเร็จ")).toBeTruthy()

			// Act — close, then reopen for the SAME member: must be a fresh form.
			view.rerender(ui(false))
			view.rerender(ui(true))

			// Assert — no stale success screen, preselected card still locks.
			expect(screen.queryByText("ต่ออายุสำเร็จ")).toBeNull()
			expect(screen.getByText("นางสาวสมหญิง ใจงาม")).toBeTruthy()
			expect(screen.getByRole("button", { name: /อนุมัติ/ })).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("empty submit shows the three-item missing-field summary without any fetch", async () => {
			// Arrange
			const { fetchMock } = renderDialog({})

			// Act
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			// Assert
			expect(await screen.findByText("กรุณาดำเนินการให้ครบถ้วน:")).toBeTruthy()
			expect(screen.getByText("เลือกสมาชิกที่ต่ออายุ")).toBeTruthy()
			expect(screen.getByText("แนบหลักฐานการโอนเงิน (Slip)")).toBeTruthy()
			expect(screen.getByText("ยอมรับหนังสือให้ความยินยอม (PDPA)")).toBeTruthy()
			expect(fetchMock.mock.calls.length).toBe(0)
		})

		it("oversized slip is rejected client-side with no upload fetch", async () => {
			// Arrange
			const { fetchMock, settleDebounce } = renderDialog({})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			const oversized = pngFile()
			Object.defineProperty(oversized, "size", { value: 8 * 1024 * 1024 })

			// Act
			pickSlipFile(oversized)

			// Assert
			expect(screen.getByText("ขนาดไฟล์ต้องไม่เกิน 7MB")).toBeTruthy()
			expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/members/file/upload").length).toBe(0)
		})

		it("409 pending-exists surfaces the server error_message inline without the success screen", async () => {
			// Arrange — the create POST will answer 409.
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(409, { error_message: "This member has a pending renewal" }),
			})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))

			// Act
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			// Assert
			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/This member has a pending renewal/)).toBeTruthy()
			expect(screen.queryByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeNull()
		})

		it("403 resigned surfaces the server error_message inline (status changed between pick and submit)", async () => {
			// Arrange — the create POST will answer 403.
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(403, { error_message: "This member has resigned" }),
			})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))

			// Act
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			// Assert
			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/This member has resigned/)).toBeTruthy()
			expect(screen.queryByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeNull()
		})

		it("404 member-not-found surfaces the server error_message inline", async () => {
			// Arrange — the create POST will answer 404.
			const { settleDebounce } = renderDialog({
				renewalsResponse: () => jsonResponse(404, { error_message: "Member not found" }),
			})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))
			await stageSlipFile(pngFile())
			fireEvent.click(screen.getByRole("checkbox"))

			// Act
			fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

			// Assert
			expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText(/Member not found/)).toBeTruthy()
		})

		it("preview derives a CSP-safe data: URL from the staged file (blob: is blocked by img-src)", async () => {
			// Arrange
			const { settleDebounce } = renderDialog({})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			// Act
			await stageSlipFile(pngFile())

			// Assert
			const preview = screen.getByRole("img", { name: /ตัวอย่างสลิป slip.png/ })
			expect(preview.getAttribute("src")?.startsWith("data:image/")).toBe(true)
		})

		it("copy button writes the account number digits-only and confirms", async () => {
			// Arrange
			const writeText = vi.fn().mockResolvedValue(undefined)
			Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
			renderDialog({})

			// Act
			fireEvent.click(screen.getByRole("button", { name: "คัดลอกเลขบัญชี" }))

			// Assert
			expect(writeText).toHaveBeenCalledWith("2078138702")
			expect(screen.getByText("คัดลอกแล้ว")).toBeTruthy()
		})

		it("non-image slip is rejected with the extension message", async () => {
			// Arrange
			const { settleDebounce } = renderDialog({})
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
			await settleDebounce()
			fireEvent.click(await screen.findByRole("option", { name: /นายสมชาย ใจดี/ }))

			// Act
			pickSlipFile(new File(["x"], "slip.pdf", { type: "application/pdf" }))

			// Assert
			expect(screen.getByText(/รองรับเฉพาะไฟล์รูปภาพ/)).toBeTruthy()
		})
	})

	describe("สมาชิกเพิ่มเติม ② — additional-member picker (#87)", () => {
		describe("Happy cases", () => {
			it("② label is always visible but the picker appears only after a main member is chosen", async () => {
				// Arrange
				const { settleDebounce } = renderDialog({})
				expect(screen.getByText(/② สมาชิกเพิ่มเติม/)).toBeTruthy()

				// Assert — gated before the main member exists.
				expect(screen.queryByRole("button", { name: "+ เพิ่มสมาชิก" })).toBeNull()

				// Act
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)

				// Assert
				expect(screen.getByRole("button", { name: "+ เพิ่มสมาชิก" })).toBeTruthy()
			})

			it("candidate list excludes the main member and already-picked additionals", async () => {
				// Arrange — main 101 + additional 102 picked.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)

				// Act — reopen the picker for the third pick.
				fireEvent.click(screen.getByRole("button", { name: "+ เพิ่มสมาชิก" }))
				fireEvent.change(screen.getByRole("combobox"), { target: { value: "สม" } })
				await settleDebounce()
				const options = await screen.findAllByRole("option")
				const optionIds = options.map((option) => option.getAttribute("data-member-id"))

				// Assert — 101/102 absent, unselected members still offered.
				expect(optionIds).not.toContain("101")
				expect(optionIds).not.toContain("102")
				expect(optionIds).toContain("103")
			})

			it("caps at five additional members — the pick affordance disappears at the cap", async () => {
				// Arrange — main + five additionals (the contract's 1..6 maximum).
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)
				await pickAdditionalMember(/นายสมพร ใจเย็น/, settleDebounce)
				await pickAdditionalMember(/นายสมควร ใจดำ/, settleDebounce)
				await pickAdditionalMember(/นายสมดี ใจงาม/, settleDebounce)

				// Assert — five additional cards + the pick affordance is gone.
				expect(screen.queryByRole("button", { name: "+ เพิ่มสมาชิก" })).toBeNull()
				expect(document.querySelectorAll('[data-slot="renewal-form-additional-member"]').length).toBe(5)
			})

			it("removing an additional member re-opens the pick affordance", async () => {
				// Arrange — main + one additional.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)
				expect(screen.getByText(/นายสมศรี ใจสู้/)).toBeTruthy()

				// Act
				fireEvent.click(screen.getByRole("button", { name: /นำ นายสมศรี ใจสู้ ออก/ }))

				// Assert — card gone, pick affordance back.
				expect(screen.queryByText(/นายสมศรี ใจสู้/)).toBeNull()
				expect(screen.getByRole("button", { name: "+ เพิ่มสมาชิก" })).toBeTruthy()
			})

			it("clearing the main member keeps the additionals (they re-gate the picker)", async () => {
				// Arrange — main + one additional, then swap the main out.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)

				// Act
				fireEvent.click(screen.getByRole("button", { name: "เปลี่ยนสมาชิก" }))

				// Assert — the additional card survives; the picker is gated again.
				expect(screen.getByText(/นายสมศรี ใจสู้/)).toBeTruthy()
				expect(screen.queryByRole("button", { name: "+ เพิ่มสมาชิก" })).toBeNull()
			})

			it("amber cross-business warning renders on a different-business pick and never blocks submission", async () => {
				// Arrange — main 101 (ร้านสมชายการค้า) + additional 103 (กิจการอื่น).
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)

				expect(screen.getByText("ไม่ได้อยู่กิจการเดียวกันกับสมาชิกหลัก")).toBeTruthy()

				// Act — a warned group still submits end to end.
				await stageSlipFile(pngFile())
				fireEvent.click(screen.getByRole("checkbox"))
				fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

				// Assert
				expect(await screen.findByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeTruthy()
			})

			it("same-business pick shows no warning", async () => {
				// Arrange — both from ร้านสมชายการค้า.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)

				// Assert
				expect(screen.queryByText("ไม่ได้อยู่กิจการเดียวกันกับสมาชิกหลัก")).toBeNull()
			})

			it("manual mode suppresses the warning — the preselect carries no business name", async () => {
				// Arrange — manual main has businessName null; pick a cross-business member anyway.
				const { settleDebounce } = renderDialog({
					mode: "manual",
					preselectedMember: expiredMembershipToFormMember({ ...MANUAL_MEMBER_ROW, position: "TREASURER" }),
				})
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)

				// Assert — cross-business pick, but the main's business is unknown.
				expect(screen.queryByText("ไม่ได้อยู่กิจการเดียวกันกับสมาชิกหลัก")).toBeNull()
			})

			it("fee rail prices the group per member: same-business 4,000, cross-business 5,000, −500 per working-team member", async () => {
				// Arrange — main (general, biz A) + same-biz committee + cross-biz general:
				// subtotal 5,000 + 4,000 + 5,000 = 14,000; discount 1×500 → total 13,500.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)

				// Assert — rail.
				expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (3 คน)")).toBeTruthy()
				expect(screen.getByText("14,000")).toBeTruthy()
				expect(screen.getByText("ส่วนลดคณะทำงาน (1 คน × 500)")).toBeTruthy()
				expect(screen.getByText("−500")).toBeTruthy()
				expect(screen.getByText("13,500 ฿")).toBeTruthy()

				// Assert — footer total.
				const footerTotal = screen.getByText(/รวมทั้งสิ้น/)
				expect(footerTotal.textContent?.includes("13,500")).toBe(true)
			})

			it("same-business additional gets the 4,000 rate — main + one same-biz general reads (2 คน) 9,000", async () => {
				// Arrange — main + one general additional from the SAME business: 5,000 + 4,000, no discount.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมพร ใจเย็น/, settleDebounce)

				// Assert
				expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (2 คน)")).toBeTruthy()
				expect(screen.getByText("9,000 ฿")).toBeTruthy()
				expect(screen.getByText("ส่วนลดคณะทำงาน (0 คน × 500)")).toBeTruthy()
			})

			it("cross-business additional pays the full 5,000 — main + one other-biz general reads (2 คน) 10,000", async () => {
				// Arrange — main + one general additional from ANOTHER business: 5,000 + 5,000, no discount.
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)

				// Assert
				expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (2 คน)")).toBeTruthy()
				expect(screen.getByText("10,000 ฿")).toBeTruthy()
				expect(screen.getByText("ส่วนลดคณะทำงาน (0 คน × 500)")).toBeTruthy()
			})

			it("submits member_ids main-first in one create POST", async () => {
				// Arrange
				const { fetchMock, settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)
				await stageSlipFile(pngFile())
				fireEvent.click(screen.getByRole("checkbox"))

				// Act
				fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))
				await screen.findByText("ส่งข้อมูลเรียบร้อยแล้ว")

				// Assert
				const createIndex = fetchMock.mock.calls.findIndex(([url]) => String(url) === "/api/v1/membership/renewals")
				expect(createIndex).toBeGreaterThanOrEqual(0)
				expect(JSON.parse(String(fetchMock.mock.calls[createIndex]?.[1]?.body))).toEqual({
					member_ids: [101, 102, 103],
					payment_slip: "members/documents/payment_slip_test.jpg",
				})
			})

			it("member success screen lists every renewed name joined and repeats the group total", async () => {
				// Arrange — main + same-biz committee + cross-biz general (total 13,500).
				const { settleDebounce } = renderDialog({})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมศรี ใจสู้/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)
				await stageSlipFile(pngFile())
				fireEvent.click(screen.getByRole("checkbox"))

				// Act
				fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))
				await screen.findByText("ส่งข้อมูลเรียบร้อยแล้ว")

				// Assert
				expect(screen.getByText(/ต่ออายุ: นายสมชาย ใจดี, นายสมศรี ใจสู้, นายสมหมาย ใจเร็ว/)).toBeTruthy()
				expect(screen.getByText("ยอดชำระ: 13,500 บาท")).toBeTruthy()
				expect(screen.getByText("สถานะ: รอตรวจสอบการโอนเงิน")).toBeTruthy()
			})

			it("manual success screen lists the group names and total under ต่ออายุสำเร็จ", async () => {
				// Arrange — manual main 202 (preselected, general, business UNKNOWN) + one
				// additional (general): unknown business prices at full 5,000 → 10,000, no discount.
				const { settleDebounce } = renderDialog({ mode: "manual", preselectedMember: expiredMembershipToFormMember(MANUAL_MEMBER_ROW) })
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)
				await stageSlipFile(pngFile())
				fireEvent.click(screen.getByRole("checkbox"))

				// Act
				fireEvent.click(screen.getByRole("button", { name: /อนุมัติ/ }))
				await screen.findByText("ต่ออายุสำเร็จ")

				// Assert
				expect(screen.getByText(/ต่ออายุ: นางสาวสมหญิง ใจงาม, นายสมหมาย ใจเร็ว/)).toBeTruthy()
				expect(screen.getByText("ยอดชำระ: 10,000 บาท")).toBeTruthy()
				expect(screen.getByText("สถานะ: ต่ออายุสำเร็จ (ปกติ)")).toBeTruthy()
			})

			it("manual mode prices every additional at 5,000 — the main's business is unknown, so no same-business rate", async () => {
				// Arrange — manual main (business unknown) + one additional.
				const { settleDebounce } = renderDialog({ mode: "manual", preselectedMember: expiredMembershipToFormMember(MANUAL_MEMBER_ROW) })
				await pickAdditionalMember(/นายสมพร ใจเย็น/, settleDebounce)

				// Assert — even a plausibly-same-business pick prices at full rate.
				expect(screen.getByText("ค่าธรรมเนียมต่ออายุ (2 คน)")).toBeTruthy()
				expect(screen.getByText("10,000 ฿")).toBeTruthy()
				expect(screen.getByText("ส่วนลดคณะทำงาน (0 คน × 500)")).toBeTruthy()
			})
		})

		describe("Unhappy cases", () => {
			it("grouped all-or-nothing rejection surfaces the API error_message inline", async () => {
				// Arrange — the batch POST will 409 naming the offending member.
				const { settleDebounce } = renderDialog({
					renewalsResponse: () => jsonResponse(409, { error_message: "Member 103 already has a pending renewal" }),
				})
				await pickMainMember(/นายสมชาย ใจดี/, settleDebounce)
				await pickAdditionalMember(/นายสมหมาย ใจเร็ว/, settleDebounce)
				await stageSlipFile(pngFile())
				fireEvent.click(screen.getByRole("checkbox"))

				// Act
				fireEvent.click(screen.getByRole("button", { name: /ส่งข้อมูล/ }))

				// Assert — no success screen; the named-member reason shows inline.
				expect(await screen.findByText("ส่งข้อมูลไม่สำเร็จ")).toBeTruthy()
				expect(screen.getByText(/Member 103 already has a pending renewal/)).toBeTruthy()
				expect(screen.queryByText("ส่งข้อมูลเรียบร้อยแล้ว")).toBeNull()
			})
		})
	})
})
