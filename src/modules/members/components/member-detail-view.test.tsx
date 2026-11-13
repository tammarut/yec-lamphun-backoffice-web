import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeMemberDetail } from "src/modules/members/components/make-member-detail.fixture"
import { SessionProvider } from "src/shared/lib/api/session"
import { MemberDetailView } from "src/modules/members/components/member-detail-view"

const mockBack = vi.hoisted(() => vi.fn())
const mockPush = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
	useRouter: () => ({ back: mockBack, push: mockPush }),
}))

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({
	toast: { success: mockToastSuccess, error: mockToastError },
}))

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

const CATEGORIES = [
	{ id: 1, category_name: "ผลิต" },
	{ id: 4, category_name: "ค้าปลีก" },
]

// The mock boundary is the NETWORK: the view runs with real hooks (detail
// query, session probe, categories, delete mutation) over a stubbed fetch.
// Only the router (no App Router context in jsdom) and the toast lib are
// module-mocked. Mutable per-test state below drives each scenario.
let sessionStatus = 204
let detailResponse: () => Response | Promise<Response>
let deleteResponse: () => Response
const detailCalls: string[] = []

function stubFetch() {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		const method = init?.method ?? "GET"
		if (url === "/api/v1/auth/session") {
			return new Response(null, { status: sessionStatus })
		}
		if (url === "/api/v1/business/categories") {
			return jsonResponse(200, { business_categories: CATEGORIES })
		}
		if (url === "/api/v1/members/7") {
			detailCalls.push(`${method} ${url}`)
			if (method === "DELETE") {
				return deleteResponse()
			}
			return detailResponse()
		}
		return jsonResponse(404, { error_message: `unexpected ${method} ${url}` })
	})
	vi.stubGlobal("fetch", fetchMock)
}

function renderDetail(memberId: number | null) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const view = render(
		<QueryClientProvider client={queryClient}>
			<SessionProvider>
				<MemberDetailView memberId={memberId} />
			</SessionProvider>
		</QueryClientProvider>
	)
	return view
}

/** The field row containing a given Thai label, for value assertions. */
function fieldRow(label: string): string | null {
	return screen.getByText(label).closest('[data-slot="member-detail-field"]')?.textContent ?? null
}

/** The th-TH label of a YYYY-MM-DD calendar day, built from local-time parts (no string parsing). */
function localDayLabel(isoDate: string): string {
	const parts = isoDate.split("-")
	const localMidnight = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
	return localMidnight.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
}

/** Admin content can land before the session probe resolves — wait for the gated buttons first. */
async function renderAsAdminWithContent(memberId = 7) {
	renderDetail(memberId)
	expect(await screen.findByRole("heading", { name: "นายสมชาย ใจดี" })).toBeTruthy()
	expect(await screen.findByRole("button", { name: /แก้ไขข้อมูล/ })).toBeTruthy()
}

describe("MemberDetailView", () => {
	beforeEach(() => {
		sessionStatus = 204
		detailResponse = () => jsonResponse(200, makeMemberDetail())
		deleteResponse = () => new Response(null, { status: 204 })
		detailCalls.length = 0
		// Radix Dialog content measures itself via ResizeObserver — absent in jsdom.
		vi.stubGlobal(
			"ResizeObserver",
			class ResizeObserverStub {
				observe() {}
				unobserve() {}
				disconnect() {}
			}
		)
		stubFetch()
	})

	afterEach(() => {
		cleanup()
		vi.clearAllMocks()
		vi.unstubAllGlobals()
	})

	describe("Happy cases", () => {
		it("renders the header identity, admin actions, and all four Thai sections with real field values", async () => {
			await renderAsAdminWithContent()

			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			// The status badge vocabulary renders in BOTH the header and the
			// สถานะ row of ข้อมูลส่วนตัว.
			expect(screen.getAllByText("ปกติ")).toHaveLength(2)
			expect(screen.getByRole("button", { name: /ย้อนกลับ/ })).toBeTruthy()
			expect(screen.getByRole("button", { name: /ลบสมาชิก/ })).toBeTruthy()

			expect(screen.getByText("ข้อมูลส่วนตัว")).toBeTruthy()
			expect(screen.getByText("ข้อมูลติดต่อ")).toBeTruthy()
			expect(screen.getByText("เอกสารและรูปภาพ")).toBeTruthy()
			expect(screen.getByText("ธุรกิจ")).toBeTruthy()

			expect(fieldRow("ชื่อเล่น")).toContain("ไอ้ติ่ง")
			expect(fieldRow("เพศ")).toContain("ชาย")
			// Date-only fields: the expectation is built from LOCAL midnight, so
			// it holds in any timezone and fails if the view parses them as UTC
			// (which shows the previous day west of Greenwich).
			expect(fieldRow("วันเดือนปีเกิด")).toContain(localDayLabel("1990-05-12"))
			expect(fieldRow("เลขบัตรประชาชน")).toContain("632XXXXXX1483")
			expect(fieldRow("วันหมดอายุบัตร")).toContain(localDayLabel("2029-08-31"))
			expect(fieldRow("ประเภทสมาชิก")).toContain("บุคคลธรรมดา")
			expect(fieldRow("เป็นสมาชิกตั้งแต่")).toContain("15 ม.ค. 2567")
			expect(fieldRow("วันหมดอายุสมาชิก")).toContain("31 ธ.ค. 2569")
			expect(fieldRow("เบอร์โทรศัพท์")).toContain("089-111-2222")
			expect(fieldRow("อีเมล")).toContain("somchai@example.com")
			expect(fieldRow("LINE ID")).toContain("somchai_line")
			expect(fieldRow("ขนาดเสื้อ")).toContain("L (อก 42)")
			expect(fieldRow("ชื่อกิจการ")).toContain("ร้านกาแฟสมชาย")
			expect(fieldRow("หมวดธุรกิจหลัก")).toContain("ค้าปลีก")
			expect(fieldRow("จำนวนสมาชิกในธุรกิจ")).toContain("3")
		})

		it("shows every null field as an em dash in its labelled row", async () => {
			detailResponse = () =>
				jsonResponse(
					200,
					makeMemberDetail({
						title_name_en: null,
						first_name_en: null,
						last_name_en: null,
						id_card_no: null,
						expires_at: null,
						email: null,
						line_id: null,
						shirt_size: null,
						id_card_image: null,
						company_certificate: null,
						business: {
							id: 3,
							member_count: 1,
							name: "ร้านกาแฟสมชาย",
							description: "กาแฟคั่วบด",
							juristic_registration_no: "5012555000123",
							category_id: 4,
							address: null,
							location: null,
							core_business: null,
							website: null,
							logo: null,
							product: null,
							created_at: "2024-01-15T00:00:00.000Z",
							updated_at: "2025-06-01T00:00:00.000Z",
						},
					})
				)
			await renderAsAdminWithContent()

			const nullLabels = [
				"คำนำหน้าชื่อ (อังกฤษ)",
				"ชื่อ (อังกฤษ)",
				"นามสกุล (อังกฤษ)",
				"เลขบัตรประชาชน",
				"วันหมดอายุสมาชิก",
				"อีเมล",
				"LINE ID",
				"ขนาดเสื้อ",
				"สำเนาบัตรประชาชน",
				"หนังสือรับรองบริษัท/ทะเบียนพาณิชย์",
				"ที่อยู่กิจการ",
				"เว็บไซต์",
			]
			for (const label of nullLabels) {
				expect(fieldRow(label)).toContain("—")
			}
		})

		it("opens documents and public files as new-tab links", async () => {
			await renderAsAdminWithContent()

			const documentLinks = await screen.findAllByRole("link", { name: "เปิดดู" })
			expect(documentLinks).toHaveLength(5)
			for (const link of documentLinks) {
				expect(link.getAttribute("target")).toBe("_blank")
				expect(link.getAttribute("rel")).toContain("noopener")
			}
			const website = await screen.findByRole("link", { name: "https://somchai.cafe" })
			expect(website.getAttribute("target")).toBe("_blank")
			expect(website.getAttribute("href")).toBe("https://somchai.cafe")
		})

		it("navigates back through browser history from the back button", async () => {
			await renderAsAdminWithContent()

			fireEvent.click(screen.getByRole("button", { name: /ย้อนกลับ/ }))
			expect(mockBack).toHaveBeenCalledTimes(1)
		})

		it("opens the existing edit wizard for this member", async () => {
			await renderAsAdminWithContent()

			fireEvent.click(screen.getByRole("button", { name: /แก้ไขข้อมูล/ }))
			expect(screen.getByRole("dialog")).toBeTruthy()
		})

		it("confirms delete with a success toast and returns to the members list", async () => {
			await renderAsAdminWithContent()

			fireEvent.click(screen.getByRole("button", { name: /ลบสมาชิก/ }))
			expect(screen.getByText("ยืนยันการลบสมาชิก")).toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }))
			await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/members"))
			expect(mockToastSuccess).toHaveBeenCalledWith("ลบสมาชิกเรียบร้อย")
			expect(detailCalls).toContain("DELETE /api/v1/members/7")
		})
	})

	describe("Unhappy cases", () => {
		it("renders the skeleton while loading, with no content sections", () => {
			detailResponse = () => new Promise<Response>(() => {})
			renderDetail(7)

			expect(screen.getByLabelText("กำลังโหลดข้อมูลสมาชิก")).toBeTruthy()
			expect(screen.queryByText("ข้อมูลส่วนตัว")).not.toBeTruthy()
			expect(screen.queryByText("ไม่พบสมาชิก")).not.toBeTruthy()
		})

		it("shows the dedicated ไม่พบสมาชิก state with a way back on 404", async () => {
			detailResponse = () => jsonResponse(404, { error_message: "Member not found" })
			renderDetail(7)

			expect(await screen.findByText("ไม่พบสมาชิก")).toBeTruthy()
			expect(screen.queryByText("โหลดข้อมูลสมาชิกไม่สำเร็จ")).not.toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: /ย้อนกลับ/ }))
			expect(mockBack).toHaveBeenCalledTimes(1)
		})

		it("shows the destructive alert with a retry that refetches on other failures", async () => {
			detailResponse = () => jsonResponse(500, { error_message: "Database exploded" })
			renderDetail(7)

			expect(await screen.findByText("โหลดข้อมูลสมาชิกไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("Database exploded")).toBeTruthy()

			// The real resetQueries → refetch path: heal the route, retry, see content.
			detailResponse = () => jsonResponse(200, makeMemberDetail())
			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			expect(await screen.findByRole("heading", { name: "นายสมชาย ใจดี" })).toBeTruthy()
		})

		it("renders the not-found state without fetching when the URL id is not a number", () => {
			renderDetail(null)

			expect(screen.getByText("ไม่พบสมาชิก")).toBeTruthy()
			expect(detailCalls).toHaveLength(0)
		})

		it("hides admin edit and delete actions from non-admins", async () => {
			sessionStatus = 401
			renderDetail(7)

			// Content still loads (the API serves it only to admins in practice,
			// but the view contract under test here is the isAdmin gating).
			expect(await screen.findByRole("heading", { name: "นายสมชาย ใจดี" })).toBeTruthy()

			expect(screen.queryByRole("button", { name: /แก้ไขข้อมูล/ })).not.toBeTruthy()
			expect(screen.queryByRole("button", { name: /ลบสมาชิก/ })).not.toBeTruthy()
			expect(screen.queryByText("ยืนยันการลบสมาชิก")).not.toBeTruthy()
		})
	})
})
