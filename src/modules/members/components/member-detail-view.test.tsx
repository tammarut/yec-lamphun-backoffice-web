import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { ApiError } from "src/shared/lib/api/fetch-json"
import { MemberDetailView } from "src/modules/members/components/member-detail-view"

/** Type-only reference — the render tree has no SessionProvider, so only the shape is needed. */
type SessionContextValue = ReturnType<typeof import("src/shared/lib/api/session").useSession>

const mockBack = vi.hoisted(() => vi.fn())
const mockPush = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
	useRouter: () => ({ back: mockBack, push: mockPush }),
}))

// ONE pre-agreed seam: the view renders through the real query/hook contract,
// so the detail hook and the session context are mocked (spec #141 testing
// decisions) — assertions stay on what the view shows per state.
const mockedUseMemberDetail = vi.hoisted(() => vi.fn())
vi.mock("src/modules/members/hooks/use-member-detail", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/modules/members/hooks/use-member-detail")>()
	return { ...actual, useMemberDetail: mockedUseMemberDetail }
})

const mockIsAdmin = vi.hoisted(() => vi.fn())
vi.mock("src/shared/lib/api/session", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/shared/lib/api/session")>()
	return {
		...actual,
		// Partial double, cast — the render tree has no SessionProvider; every
		// consumer under test only reads isAdmin.
		useSession: () =>
			({
				isAdmin: mockIsAdmin(),
				isCheckingSession: false,
				loginMutation: null,
				logoutMutation: null,
			}) as unknown as SessionContextValue,
	}
})

const mockedUseBusinessCategories = vi.hoisted(() => vi.fn())
vi.mock("src/modules/members/hooks/use-business-categories", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/modules/members/hooks/use-business-categories")>()
	return { ...actual, useBusinessCategories: mockedUseBusinessCategories }
})

const mockedDeleteMutate = vi.hoisted(() => vi.fn())
vi.mock("src/modules/members/hooks/use-members", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/modules/members/hooks/use-members")>()
	return {
		...actual,
		// The delete flow's toasts + navigation are the VIEW's contract; the
		// mutation itself is hook-tested elsewhere.
		useDeleteMember: () => ({
			mutate: mockedDeleteMutate,
			isPending: false,
		}),
	}
})

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({
	toast: { success: mockToastSuccess, error: mockToastError },
}))

const CATEGORIES = [
	{ id: 1, category_name: "ผลิต" },
	{ id: 4, category_name: "ค้าปลีก" },
]

function makeMemberDetail(overrides: Partial<MemberDetailResponse> = {}): MemberDetailResponse {
	return {
		id: 7,
		registration_type: "INDIVIDUAL",
		company_certificate: "https://private.r2.cloudflarestorage.com/cert.jpg?X-Amz-Signature=abc",
		id_card_image: "https://private.r2.cloudflarestorage.com/idcard.jpg?X-Amz-Signature=def",
		profile_avatar: "https://public.r2.example.com/avatar.jpg",
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		title_name_en: "Mr.",
		first_name_en: "Somchai",
		last_name_en: "Jaidee",
		nickname: "ไอ้ติ่ง",
		gender: "MALE",
		date_of_birth: "1990-05-12",
		nationality: "ไทย",
		id_card_no: "632XXXXXX1483",
		id_card_expiry_date: "2029-08-31",
		member_since: "2024-01-15T00:00:00.000Z",
		expires_at: "2026-12-31T00:00:00.000Z",
		phone_no: "089-111-2222",
		email: "somchai@example.com",
		line_id: "somchai_line",
		shirt_size: "L",
		position: "GENERAL_MEMBER",
		status: "ACTIVE",
		created_at: "2024-01-15T00:00:00.000Z",
		updated_at: "2025-06-01T00:00:00.000Z",
		business: {
			id: 3,
			member_count: 3,
			name: "ร้านกาแฟสมชาย",
			description: "กาแฟคั่วบด รับทำคาเตอร์ริ่ง",
			juristic_registration_no: "5012555000123",
			category_id: 4,
			address: "55/2 ถ.ซุปหารณี ต.เวียงยอง อ.เมืองลำพูน",
			location: [99.0094, 18.5753],
			core_business: "ค้าปลีกเครื่องดื่ม",
			website: "https://somchai.cafe",
			logo: "https://public.r2.example.com/logo.png",
			product: "https://public.r2.example.com/product.jpg",
			created_at: "2024-01-15T00:00:00.000Z",
			updated_at: "2025-06-01T00:00:00.000Z",
		},
		...overrides,
	}
}

type DetailState = { phase: "idle" } | { phase: "pending" } | { phase: "success"; data: MemberDetailResponse } | { phase: "error"; status: number; message: string }

let detailState: DetailState = { phase: "idle" }

mockedUseMemberDetail.mockImplementation((id: number | null) => {
	if (id === null || detailState.phase === "idle") {
		return { isPending: false, isError: false, data: undefined, error: null }
	}
	if (detailState.phase === "pending") {
		return { isPending: true, isError: false, data: undefined, error: null }
	}
	if (detailState.phase === "success") {
		return { isPending: false, isError: false, data: detailState.data, error: null }
	}
	return {
		isPending: false,
		isError: true,
		data: undefined,
		error: new ApiError(detailState.message, detailState.status),
	}
})

mockedUseBusinessCategories.mockImplementation(() => ({ data: CATEGORIES }))

mockedDeleteMutate.mockImplementation((_id: number, options: { onSuccess?: () => void }) => {
	if (options?.onSuccess) {
		options.onSuccess()
	}
})

function renderDetail(memberId: number | null) {
	const queryClient = new QueryClient()
	const view = render(
		<QueryClientProvider client={queryClient}>
			<MemberDetailView memberId={memberId} />
		</QueryClientProvider>
	)
	return { queryClient, ...view }
}

/** The field row containing a given Thai label, for value assertions. */
function fieldRow(label: string): string | null {
	return screen.getByText(label).closest('[data-slot="member-detail-field"]')?.textContent ?? null
}

describe("MemberDetailView", () => {
	beforeEach(() => {
		detailState = { phase: "idle" }
		mockIsAdmin.mockReturnValue(true)
		// Radix Dialog content measures itself via ResizeObserver — absent in jsdom.
		vi.stubGlobal(
			"ResizeObserver",
			class ResizeObserverStub {
				observe() {}
				unobserve() {}
				disconnect() {}
			}
		)
	})

	afterEach(() => {
		cleanup()
		vi.clearAllMocks()
		vi.unstubAllGlobals()
	})

	describe("Happy cases", () => {
		it("renders the header identity, admin actions, and all four Thai sections with real field values", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			renderDetail(7)

			expect(screen.getByRole("heading", { name: "นายสมชาย ใจดี" })).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			// The status badge vocabulary renders in BOTH the header and the
			// สถานะ row of ข้อมูลส่วนตัว.
			expect(screen.getAllByText("ปกติ")).toHaveLength(2)
			expect(screen.getByRole("button", { name: /ย้อนกลับ/ })).toBeTruthy()
			expect(screen.getByRole("button", { name: /แก้ไขข้อมูล/ })).toBeTruthy()
			expect(screen.getByRole("button", { name: /ลบสมาชิก/ })).toBeTruthy()

			expect(screen.getByText("ข้อมูลส่วนตัว")).toBeTruthy()
			expect(screen.getByText("ข้อมูลติดต่อ")).toBeTruthy()
			expect(screen.getByText("เอกสารและรูปภาพ")).toBeTruthy()
			expect(screen.getByText("ธุรกิจ")).toBeTruthy()

			expect(fieldRow("ชื่อเล่น")).toContain("ไอ้ติ่ง")
			expect(fieldRow("เพศ")).toContain("ชาย")
			expect(fieldRow("วันเดือนปีเกิด")).toContain("12 พ.ค. 2533")
			expect(fieldRow("เลขบัตรประชาชน")).toContain("632XXXXXX1483")
			expect(fieldRow("วันหมดอายุบัตร")).toContain("31 ส.ค. 2572")
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

		it("shows every null field as an em dash in its labelled row", () => {
			detailState = {
				phase: "success",
				data: makeMemberDetail({
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
				}),
			}
			renderDetail(7)

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

		it("opens documents and public files as new-tab links", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			renderDetail(7)

			const documentLinks = screen.getAllByRole("link", { name: "เปิดดู" })
			expect(documentLinks).toHaveLength(5)
			for (const link of documentLinks) {
				expect(link.getAttribute("target")).toBe("_blank")
				expect(link.getAttribute("rel")).toContain("noopener")
			}
			const website = screen.getByRole("link", { name: "https://somchai.cafe" })
			expect(website.getAttribute("target")).toBe("_blank")
			expect(website.getAttribute("href")).toBe("https://somchai.cafe")
		})

		it("navigates back through browser history from the back button", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			renderDetail(7)

			fireEvent.click(screen.getByRole("button", { name: /ย้อนกลับ/ }))
			expect(mockBack).toHaveBeenCalledTimes(1)
		})

		it("opens the existing edit wizard for this member", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			renderDetail(7)

			fireEvent.click(screen.getByRole("button", { name: /แก้ไขข้อมูล/ }))
			expect(screen.getByRole("dialog")).toBeTruthy()
		})

		it("confirms delete with a success toast and returns to the members list", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			renderDetail(7)

			fireEvent.click(screen.getByRole("button", { name: /ลบสมาชิก/ }))
			expect(screen.getByText("ยืนยันการลบสมาชิก")).toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }))
			expect(mockedDeleteMutate).toHaveBeenCalledWith(7, expect.objectContaining({ onSuccess: expect.any(Function) }))
			expect(mockToastSuccess).toHaveBeenCalledWith("ลบสมาชิกเรียบร้อย")
			expect(mockPush).toHaveBeenCalledWith("/members")
		})
	})

	describe("Unhappy cases", () => {
		it("renders the skeleton while loading, with no content sections", () => {
			detailState = { phase: "pending" }
			renderDetail(7)

			expect(screen.getByLabelText("กำลังโหลดข้อมูลสมาชิก")).toBeTruthy()
			expect(screen.queryByText("ข้อมูลส่วนตัว")).not.toBeTruthy()
			expect(screen.queryByText("ไม่พบสมาชิก")).not.toBeTruthy()
		})

		it("shows the dedicated ไม่พบสมาชิก state with a way back on 404", () => {
			detailState = { phase: "error", status: 404, message: "Member not found" }
			renderDetail(7)

			expect(screen.getByText("ไม่พบสมาชิก")).toBeTruthy()
			expect(screen.queryByText("โหลดข้อมูลสมาชิกไม่สำเร็จ")).not.toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: /ย้อนกลับ/ }))
			expect(mockBack).toHaveBeenCalledTimes(1)
		})

		it("shows the destructive alert with a retry that resets the detail query on other failures", () => {
			detailState = { phase: "error", status: 401, message: "Unauthorized" }
			const { queryClient } = renderDetail(7)
			const resetSpy = vi.spyOn(queryClient, "resetQueries")

			expect(screen.getByText("โหลดข้อมูลสมาชิกไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("Unauthorized")).toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: /ลองใหม่/ }))
			expect(resetSpy).toHaveBeenCalledWith({ queryKey: ["members", "detail", 7] })
		})

		it("renders the not-found state without fetching when the URL id is not a number", () => {
			detailState = { phase: "idle" }
			renderDetail(null)

			expect(mockedUseMemberDetail).toHaveBeenCalledWith(null)
			expect(screen.getByText("ไม่พบสมาชิก")).toBeTruthy()
		})

		it("hides admin edit and delete actions from non-admins", () => {
			detailState = { phase: "success", data: makeMemberDetail() }
			mockIsAdmin.mockReturnValue(false)
			renderDetail(7)

			expect(screen.queryByRole("button", { name: /แก้ไขข้อมูล/ })).not.toBeTruthy()
			expect(screen.queryByRole("button", { name: /ลบสมาชิก/ })).not.toBeTruthy()
			expect(screen.queryByText("ยืนยันการลบสมาชิก")).not.toBeTruthy()
		})
	})
})
