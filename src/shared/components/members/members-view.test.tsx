import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MemberListItem } from "src/shared/components/members/members-types"
import { MembersView } from "src/shared/components/members/members-view"
import { SessionProvider } from "src/shared/lib/api/session"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function makeMember(overrides: Partial<MemberListItem> = {}): MemberListItem {
	return {
		id: 1,
		profile_avatar: null,
		registration_type: "INDIVIDUAL",
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		nickname: "ชาย",
		phone_no: "089-111-2222",
		email: "somchai@example.com",
		line_id: "somchai",
		position: "GENERAL_MEMBER",
		status: "ACTIVE",
		business: { name: "ร้านกาแฟสมชาย", description: "กาแฟคั่วบด" },
		...overrides,
	}
}

function listPage(members: MemberListItem[]) {
	return { data: members, has_more: false, next_cursor: null }
}

/**
 * Render MembersView against a stubbed fetch. `sessionOk` toggles the admin
 * probe (204 = staff, 401 = public); `listResponse` produces the list GET.
 */
function renderView(options: { sessionOk: boolean; listResponse: () => Response }) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") {
			return jsonResponse(options.sessionOk ? 204 : 401, options.sessionOk ? undefined : { error_message: "Unauthorized" })
		}
		if (url.startsWith("/api/v1/members?") && (init?.method ?? "GET") === "GET") {
			return options.listResponse()
		}
		if (url === "/api/v1/members/1" && init?.method === "DELETE") {
			return jsonResponse(204)
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)
	vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	render(
		<QueryClientProvider client={queryClient}>
			<SessionProvider>
				<MembersView />
			</SessionProvider>
		</QueryClientProvider>
	)
	return { fetchMock }
}

describe("MembersView", () => {
	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	describe("Happy cases", () => {
		it("public: renders rows without any admin controls (no checkboxes, จัดการ, badges)", async () => {
			renderView({ sessionOk: false, listResponse: () => jsonResponse(200, listPage([makeMember()])) })

			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.queryByRole("checkbox")).toBeNull()
			expect(screen.queryByRole("columnheader", { name: "จัดการ" })).toBeNull()
			expect(screen.queryByText("ปกติ")).toBeNull()
			expect(screen.getByPlaceholderText("ค้นหาชื่อ, ตำแหน่ง...")).toBeTruthy()
		})

		it("admin: rows carry checkboxes, status badges and the จัดการ column", async () => {
			renderView({ sessionOk: true, listResponse: () => jsonResponse(200, listPage([makeMember()])) })

			expect(await screen.findByRole("checkbox", { name: "เลือก นายสมชาย ใจดี" })).toBeTruthy()
			expect(screen.getByText("ปกติ")).toBeTruthy()
			expect(screen.getByRole("columnheader", { name: "จัดการ" })).toBeTruthy()
		})

		it("admin: selecting rows reveals the bulk bar, and delete removes the row after invalidation", async () => {
			const state = { members: [makeMember()] }
			const { fetchMock } = renderView({
				sessionOk: true,
				listResponse: () => jsonResponse(200, listPage(state.members)),
			})

			fireEvent.click(await screen.findByRole("checkbox", { name: "เลือก นายสมชาย ใจดี" }))
			expect(await screen.findByText("เลือกแล้ว 1 รายการ")).toBeTruthy()

			fireEvent.click(screen.getByRole("button", { name: "ลบสมาชิก นายสมชาย ใจดี" }))
			expect(screen.getByText("ยืนยันการลบสมาชิก")).toBeTruthy()

			// The invalidation refetch races the DELETE settle — flip the stub's
			// data before confirming so the refetch already sees the member gone.
			state.members = []
			fireEvent.click(screen.getByRole("button", { name: "ยืนยันลบ" }))
			await waitFor(() => {
				expect(fetchMock).toHaveBeenCalledWith("/api/v1/members/1", expect.objectContaining({ method: "DELETE" }))
			})

			expect(await screen.findByText("ไม่พบข้อมูลสมาชิก")).toBeTruthy()
			expect(screen.queryByText("นายสมชาย ใจดี")).toBeNull()
		})

		it("fetches page one with limit=20 and no search param for an empty term", async () => {
			const { fetchMock } = renderView({
				sessionOk: false,
				listResponse: () => jsonResponse(200, listPage([makeMember()])),
			})

			await screen.findByText("นายสมชาย ใจดี")
			expect(fetchMock).toHaveBeenCalledWith("/api/v1/members?limit=20", undefined)
		})
	})

	describe("Unhappy cases", () => {
		it("empty result renders ไม่พบข้อมูลสมาชิก", async () => {
			renderView({ sessionOk: false, listResponse: () => jsonResponse(200, listPage([])) })

			expect(await screen.findByText("ไม่พบข้อมูลสมาชิก")).toBeTruthy()
		})

		it("list error renders the alert with a retry button that refetches", async () => {
			let failing = true
			renderView({
				sessionOk: false,
				listResponse: () => (failing ? jsonResponse(500, { error_message: "Internal Server Error" }) : jsonResponse(200, listPage([makeMember()]))),
			})

			expect(await screen.findByText("โหลดรายชื่อสมาชิกไม่สำเร็จ")).toBeTruthy()

			failing = false
			fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }))
			expect(await screen.findByText("นายสมชาย ใจดี")).toBeTruthy()
		})

		it("shows โหลดเพิ่มเติม only while has_more is true", async () => {
			const state = { hasMore: true }
			renderView({
				sessionOk: false,
				listResponse: () =>
					jsonResponse(200, {
						data: [makeMember()],
						has_more: state.hasMore,
						next_cursor: state.hasMore ? "1" : null,
					}),
			})

			expect(await screen.findByText("โหลดเพิ่มเติม")).toBeTruthy()

			state.hasMore = false
			fireEvent.click(screen.getByRole("button", { name: "โหลดเพิ่มเติม" }))
			await waitFor(() => {
				expect(screen.queryByRole("button", { name: "โหลดเพิ่มเติม" })).toBeNull()
			})
		})
	})
})
