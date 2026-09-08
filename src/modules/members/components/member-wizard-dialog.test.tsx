import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { MemberWizardDialog } from "src/modules/members/components/member-wizard-dialog"

// jsdom lacks the pointer-capture + scrollIntoView APIs Radix Select relies on.
beforeAll(() => {
	Element.prototype.hasPointerCapture = () => false
	Element.prototype.setPointerCapture = () => undefined
	Element.prototype.releasePointerCapture = () => undefined
	Element.prototype.scrollIntoView = () => undefined
})

const CATEGORIES = [
	{ id: 1, category_name: "อุตสาหกรรมการผลิต" },
	{ id: 2, category_name: "พาณิชยกรรม การค้า และค้าระวังประเทศ" },
]

const uploadPaths = (overrides: Record<string, string> = {}) => ({
	id_card_image_file_path: null,
	company_certificate_file_path: null,
	profile_avatar_file_path: null,
	business_logo_file_path: null,
	business_product_file_path: null,
	payment_slip_file_path: null,
	...overrides,
})

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

type ResponseRouter = (url: string, init?: RequestInit) => Response | undefined

function renderWizard(options: { mobile?: boolean; route?: ResponseRouter; onOpenChange?: (open: boolean) => void } = {}) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		const routed = options.route?.(url, init)
		if (routed !== undefined) {
			return routed
		}
		if (url === "/api/v1/business/categories") {
			return jsonResponse(200, { business_categories: CATEGORIES })
		}
		if (url === "/api/v1/members/file/upload") {
			return jsonResponse(200, uploadPaths({ profile_avatar_file_path: "members/profile_avatars/profile_avatar_X.png" }))
		}
		if (url === "/api/v1/members" && init?.method === "POST") {
			return jsonResponse(201, { id: 42 })
		}
		return jsonResponse(404, { error_message: `unexpected url ${url}` })
	})
	vi.stubGlobal("fetch", fetchMock)
	vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: options.mobile === true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	vi.stubGlobal("innerWidth", options.mobile === true ? 375 : 1280)

	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
	const onOpenChange = vi.fn(options.onOpenChange)
	// A stateful harness: the real parent owns `open`, so onOpenChange(false)
	// must actually close (and a later reopen must re-run the open effect).
	function Harness() {
		const [open, setOpen] = useState(true)
		return (
			<QueryClientProvider client={queryClient}>
				<MemberWizardDialog
					open={open}
					onOpenChange={(next) => {
						onOpenChange(next)
						setOpen(next)
					}}
				/>
			</QueryClientProvider>
		)
	}
	render(<Harness />)
	return { fetchMock, onOpenChange }
}

function setInput(value: string, getBy: RegExp | string) {
	const input = screen.getByPlaceholderText(getBy)
	fireEvent.change(input, { target: { value } })
	fireEvent.blur(input)
}

async function goToStep2() {
	fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))
	await screen.findByPlaceholderText("ชื่อจริง")
}

/** Fill every required field of step 2 (defaults cover the rest). */
async function fillStep2() {
	setInput("สมชาย", "ชื่อจริง")
	setInput("ใจดี", "นามสกุล")
	setInput("ชาย", "ชื่อเล่น")
	fireEvent.change(screen.getByLabelText("วันเดือนปีเกิด*"), { target: { value: "1990-06-15" } })
	fireEvent.change(screen.getByLabelText("วันหมดอายุบัตร*"), { target: { value: "2035-01-01" } })
	setInput("1234567890123", "x-xxxx-xxxxx-xx-x")
	setInput("081-234-5678", "xxx-xxx-xxxx")

	const avatarInput = document.querySelector('input[type="file"]')
	fireEvent.change(avatarInput as Element, {
		target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] },
	})
}

async function fillStep3() {
	setInput("สมชาย คอนสตรัคชั่น", "ชื่อกิจการ/ร้านค้า")
	setInput("0505561000123", "เลขทะเบียนนิติบุคคล")
	setInput("รับเหมาก่อสร้างครบวงจร", "แนะนำธุรกิจของท่าน...")

	const categoryTrigger = await screen.findByRole("combobox", { name: "หมวดธุรกิจหลัก*" })
	fireEvent.pointerDown(categoryTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
	fireEvent.pointerUp(categoryTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
	const option = await screen.findByRole("option", { name: "อุตสาหกรรมการผลิต" })
	fireEvent.pointerUp(option)
	fireEvent.click(option)
}

/** Fill every required field of steps 2 and 3, ending on the review step. */
async function fillValidForm() {
	await goToStep2()
	await fillStep2()
	fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))
	await screen.findByPlaceholderText("ชื่อกิจการ/ร้านค้า")
	await fillStep3()
	fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))
	await screen.findByText(/ตรวจสอบข้อมูลทั้งหมดก่อนบันทึก/)
}

/** Wait out the submit-arming window, then click deliberately. */
async function armAndSubmit() {
	const submitButton = await screen.findByRole("button", { name: "ยืนยันบันทึกข้อมูล" })
	await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false))
	fireEvent.click(submitButton)
}

async function submitFromReview() {
	await armAndSubmit()
	await screen.findByText("ลงทะเบียนสมาชิกเรียบร้อย")
}

describe("MemberWizardDialog", () => {
	beforeEach(() => {
		localStorage.clear()
		// Re-applied every test: afterEach's unstubAllGlobals wipes it otherwise.
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

	describe("Happy cases", () => {
		it("renders the shell: rail with locked-forward steps, header, autosave badge", async () => {
			renderWizard()

			expect(await screen.findByText("ลงทะเบียนสมาชิกใหม่")).toBeTruthy()
			expect(screen.getByText("บันทึกฉบับร่างอัตโนมัติ")).toBeTruthy()
			const rail = screen.getByRole("navigation", { name: "ขั้นตอนการกรอกข้อมูล" })
			expect(within(rail).getByText("ข้อมูลการสมัคร").closest("button")?.getAttribute("aria-current")).toBe("step")
			// Locked-forward: until step 1 validates via ถัดไป, every later rail step is locked.
			expect(within(rail).getByText("ข้อมูลส่วนตัว").closest("button")?.disabled).toBe(true)
			expect(within(rail).getByText("ข้อมูลธุรกิจ").closest("button")?.disabled).toBe(true)
			expect(within(rail).getByText("ตรวจสอบข้อมูล").closest("button")?.disabled).toBe(true)
		})

		it("mobile: shows ขั้นตอน X/4 progress instead of the rail", async () => {
			renderWizard({ mobile: true })

			expect(await screen.findByText("ขั้นตอน 1/4 · ข้อมูลการสมัคร")).toBeTruthy()
			expect(screen.getByRole("progressbar")).toBeTruthy()
		})

		it("blocks ถัดไป on an invalid step with the error summary and aria-invalid wiring", async () => {
			renderWizard()
			await goToStep2()

			fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))

			expect(await screen.findByText("พบข้อผิดพลาด 7 รายการ กรุณาตรวจสอบข้อมูล")).toBeTruthy()
			const firstName = screen.getByPlaceholderText("ชื่อจริง")
			expect(firstName.getAttribute("aria-invalid")).toBe("true")
			expect(screen.getByText("ขั้นตอน 2/4 · ข้อมูลส่วนตัว")).toBeTruthy()
			// The review step is still unreachable from the rail.
			expect(screen.getByText("ตรวจสอบข้อมูล").closest("button")?.disabled).toBe(true)
		})

		it("fills the whole form, reviews values, and jumps back via แก้ไข", async () => {
			renderWizard()
			await fillValidForm()

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("1234567890123")).toBeTruthy()
			expect(screen.getByText("อุตสาหกรรมการผลิต")).toBeTruthy()
			expect(screen.getByText("avatar.png")).toBeTruthy()
			expect(screen.getByText("ระบบจะคำนวณอัตโนมัติ")).toBeTruthy()
			expect(screen.getByText("ระบบจะระบุอัตโนมัติ")).toBeTruthy()

			const businessSection = document.querySelector('[data-slot="wizard-review-section"][data-step="3"]') as HTMLElement
			fireEvent.click(within(businessSection).getByRole("button", { name: "แก้ไข" }))
			expect(await screen.findByPlaceholderText("เลขทะเบียนนิติบุคคล")).toBeTruthy()
		})

		it("submits uploads-first and shows the success dialog; เพิ่มสมาชิกอีกคน resets the form", async () => {
			const { fetchMock } = renderWizard()
			await fillValidForm()
			await submitFromReview()

			expect(screen.getByText("ข้อมูลของ นายสมชาย ใจดี ถูกบันทึกลงระบบแล้ว")).toBeTruthy()

			const uploadCall = fetchMock.mock.calls.find(([url]) => String(url) === "/api/v1/members/file/upload")
			expect(uploadCall).toBeDefined()
			const uploadBody = uploadCall?.[1]?.body as FormData
			expect(uploadBody.get("profile_avatar")).toBeInstanceOf(File)

			const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")
			expect(createCall).toBeDefined()
			const payload = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>
			expect(payload["first_name_th"]).toBe("สมชาย")
			expect(payload["profile_avatar"]).toBe("members/profile_avatars/profile_avatar_X.png")
			expect(payload["business.category_id"]).toBeUndefined()
			expect((payload["business"] as Record<string, unknown>)["category_id"]).toBe(1)
			expect(payload["shirt_size"]).toBeUndefined()

			// Draft cleared on successful submit.
			expect(localStorage.getItem("yec-member-form-draft")).toBeNull()

			fireEvent.click(screen.getByRole("button", { name: "เพิ่มสมาชิกอีกคน" }))
			expect(await screen.findByText("ขั้นตอน 1/4 · ข้อมูลการสมัคร")).toBeTruthy()
			expect(screen.queryByPlaceholderText("ชื่อจริง")).toBeNull()
			expect(screen.queryByText("กู้คืนฉบับร่างที่บันทึกไว้ล่าสุดแล้ว")).toBeNull()
		})

		it("ดูรายชื่อสมาชิก closes everything", async () => {
			const { onOpenChange } = renderWizard()
			await fillValidForm()
			await submitFromReview()

			fireEvent.click(screen.getByRole("button", { name: "ดูรายชื่อสมาชิก" }))
			await waitFor(() => expect(screen.queryByText("ลงทะเบียนสมาชิกเรียบร้อย")).toBeNull())
			expect(onOpenChange).toHaveBeenCalledWith(false)
		})

		it("restores a stored draft with the banner; เริ่มกรอกใหม่ clears it", async () => {
			renderWizard()
			await goToStep2()
			setInput("สมชาย", "ชื่อจริง")
			expect((JSON.parse(localStorage.getItem("yec-member-form-draft") ?? "{}") as { first_name_th?: string }).first_name_th).toBe("สมชาย")
			cleanup()

			renderWizard()
			expect(await screen.findByText("กู้คืนฉบับร่างที่บันทึกไว้ล่าสุดแล้ว")).toBeTruthy()
			// The draft restores values but always reopens on step 1.
			await goToStep2()
			expect((screen.getByPlaceholderText("ชื่อจริง") as HTMLInputElement).value).toBe("สมชาย")

			fireEvent.click(screen.getByRole("button", { name: "เริ่มกรอกใหม่" }))
			await waitFor(() => expect(screen.queryByText("กู้คืนฉบับร่างที่บันทึกไว้ล่าสุดแล้ว")).toBeNull())
			expect((screen.getByPlaceholderText("ชื่อจริง") as HTMLInputElement).value).toBe("")
			expect(localStorage.getItem("yec-member-form-draft")).toBeNull()
		})
	})

	describe("Unhappy cases", () => {
		it("repro: a rapid second click at the 3→4 transition must not submit (ถัดไป swaps to ยืนยัน at the same spot)", async () => {
			const { fetchMock } = renderWizard()
			await goToStep2()
			await fillStep2()
			fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))
			await screen.findByPlaceholderText("ชื่อกิจการ/ร้านค้า")
			await fillStep3()

			// Click #1 advances to review; the footer's bottom-right button then
			// becomes ยืนยันบันทึกข้อมูล at the SAME coordinates. Click #2 (double
			// click / impatient re-click) lands on it.
			fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))
			const submitButton = await screen.findByRole("button", { name: "ยืนยันบันทึกข้อมูล" })
			expect((submitButton as HTMLButtonElement).disabled).toBe(true)
			fireEvent.click(submitButton)

			await new Promise((resolve) => setTimeout(resolve, 100))
			const submitCalls = fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")
			expect(submitCalls).toHaveLength(0)
			expect(screen.queryByText("ลงทะเบียนสมาชิกเรียบร้อย")).toBeNull()
		})

		it("a deliberate submit after reviewing still works", async () => {
			const { fetchMock } = renderWizard()
			await fillValidForm()
			await armAndSubmit()

			await screen.findByText("ลงทะเบียนสมาชิกเรียบร้อย")
			const submitCalls = fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")
			expect(submitCalls).toHaveLength(1)
		})

		it("juristic applicant without the company certificate cannot advance past step 1", async () => {
			renderWizard()
			await screen.findByText("ลงทะเบียนสมาชิกใหม่")

			fireEvent.click(screen.getByRole("radio", { name: /นิติบุคคล/ }))
			fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))

			expect(await screen.findByText("พบข้อผิดพลาด 1 รายการ กรุณาตรวจสอบข้อมูล")).toBeTruthy()
			// Same copy renders as the field helper AND the field error.
			expect(screen.getAllByText("นิติบุคคลต้องแนบหนังสือรับรองบริษัท").length).toBeGreaterThan(0)
			expect(screen.getByText("ข้อมูลส่วนตัว").closest("button")?.disabled).toBe(true)
		})

		it("rejects an oversized file client-side at selection (no upload)", async () => {
			const { fetchMock } = renderWizard()
			await screen.findByText("ลงทะเบียนสมาชิกใหม่")

			const certInput = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement
			const oversized = new File([new ArrayBuffer(8)], "big.png", { type: "image/png" })
			Object.defineProperty(oversized, "size", { value: 8 * 1024 * 1024 })
			fireEvent.change(certInput, { target: { files: [oversized] } })

			expect(await screen.findByText("ขนาดไฟล์ต้องไม่เกิน 7MB")).toBeTruthy()
			expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/members/file/upload", expect.anything())
		})

		it("dirty guard: X opens the 3-way confirm; ออกโดยไม่บันทึก discards the draft", async () => {
			renderWizard()
			await goToStep2()
			setInput("สมชาย", "ชื่อจริง")

			fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }))

			expect(await screen.findByText("มีข้อมูลที่ยังไม่ได้บันทึก")).toBeTruthy()
			expect((JSON.parse(localStorage.getItem("yec-member-form-draft") ?? "{}") as { first_name_th?: string }).first_name_th).toBe("สมชาย")

			fireEvent.click(screen.getByRole("button", { name: "ออกโดยไม่บันทึก" }))
			await waitFor(() => expect(screen.queryByText("มีข้อมูลที่ยังไม่ได้บันทึก")).toBeNull())
			expect(localStorage.getItem("yec-member-form-draft")).toBeNull()
		})

		it("dirty guard: Escape is intercepted into the confirm, not a close", async () => {
			const { onOpenChange } = renderWizard()
			await goToStep2()
			setInput("สมชาย", "ชื่อจริง")

			fireEvent.keyDown(document.body, { key: "Escape" })

			expect(await screen.findByText("ต้องการบันทึกฉบับร่างไว้ก่อนออกจากหน้านี้หรือไม่?")).toBeTruthy()
			expect(onOpenChange).not.toHaveBeenCalled()
		})

		it("dirty guard: แก้ไขต่อ keeps the wizard open with its data", async () => {
			renderWizard()
			await goToStep2()
			setInput("สมชาย", "ชื่อจริง")
			fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }))
			await screen.findByText("มีข้อมูลที่ยังไม่ได้บันทึก")

			fireEvent.click(screen.getByRole("button", { name: "แก้ไขต่อ" }))

			await waitFor(() => expect(screen.queryByText("มีข้อมูลที่ยังไม่ได้บันทึก")).toBeNull())
			expect((screen.getByPlaceholderText("ชื่อจริง") as HTMLInputElement).value).toBe("สมชาย")
		})

		it("a clean (non-dirty) form closes directly without the guard", async () => {
			const { onOpenChange } = renderWizard()
			await screen.findByText("ลงทะเบียนสมาชิกใหม่")

			fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าต่าง" }))

			await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
			expect(screen.queryByText("มีข้อมูลที่ยังไม่ได้บันทึก")).toBeNull()
		})

		it("409 duplicate id card surfaces as a Thai field error on step 2", async () => {
			renderWizard({
				route: (url, init) => {
					if (url === "/api/v1/members" && init?.method === "POST") {
						return jsonResponse(409, { error_message: "A member with this ID card already exists" })
					}
					return undefined
				},
			})
			await fillValidForm()
			await armAndSubmit()

			expect(await screen.findByText("เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว")).toBeTruthy()
			expect(screen.queryByText("ลงทะเบียนสมาชิกเรียบร้อย")).toBeNull()
		})

		it("409 occupied position surfaces as a Thai field error naming the position", async () => {
			renderWizard({
				route: (url, init) => {
					if (url === "/api/v1/members" && init?.method === "POST") {
						return jsonResponse(409, { error_message: "Position PRESIDENT is already held" })
					}
					return undefined
				},
			})
			await fillValidForm()
			await armAndSubmit()

			expect(await screen.findByText("ตำแหน่งนี้มีผู้ดำรงตำแหน่งอยู่แล้ว (ประธาน YEC Lamphun)")).toBeTruthy()
			expect(screen.queryByText("ลงทะเบียนสมาชิกเรียบร้อย")).toBeNull()
		})

		it("unexpected server failures surface as the raw message in a top alert", async () => {
			renderWizard({
				route: (url, init) => {
					if (url === "/api/v1/members" && init?.method === "POST") {
						return jsonResponse(500, { error_message: "Internal Server Error" })
					}
					return undefined
				},
			})
			await fillValidForm()
			await armAndSubmit()

			expect(await screen.findByText("Internal Server Error")).toBeTruthy()
			expect(screen.queryByText("ลงทะเบียนสมาชิกเรียบร้อย")).toBeNull()
		})

		it("categories fetch failure shows an inline retry alert on step 3", async () => {
			renderWizard({
				route: (url) => {
					if (url === "/api/v1/business/categories") {
						return jsonResponse(500, { error_message: "Internal Server Error" })
					}
					return undefined
				},
			})
			await goToStep2()
			await fillStep2()
			fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }))

			expect(await screen.findByText("โหลดหมวดธุรกิจไม่สำเร็จ")).toBeTruthy()
		})
	})
})
