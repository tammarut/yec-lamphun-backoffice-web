import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"

import type { MemberListItem } from "src/shared/components/members/members-types"
import { MembersTable } from "src/shared/components/members/members-table"

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

function renderTable(overrides: Partial<Parameters<typeof MembersTable>[0]> = {}) {
	const props = {
		members: [makeMember()],
		isAdmin: true,
		selectedIds: new Set<number>(),
		onToggleOne: vi.fn(),
		onToggleAll: vi.fn(),
		onDeleteClick: vi.fn(),
		...overrides,
	}
	render(<MembersTable {...props} />)
	return props
}

describe("MembersTable", () => {
	afterEach(cleanup)

	describe("Happy cases", () => {
		test("renders member rows: glued Thai name, nickname, position label, business, contacts", () => {
			renderTable()

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			expect(screen.getByText("ร้านกาแฟสมชาย")).toBeTruthy()
			expect(screen.getByText("กาแฟคั่วบด")).toBeTruthy()
			expect(screen.getByText("089-111-2222")).toBeTruthy()
			expect(screen.getByText("somchai@example.com")).toBeTruthy()
			expect(screen.getByText("somchai")).toBeTruthy()
		})

		test("maps position codes to the official Thai labels", () => {
			renderTable({
				members: [makeMember({ id: 2, position: "PRESIDENT", first_name_th: "อนันต์" })],
			})

			expect(screen.getByText("ประธาน YEC Lamphun")).toBeTruthy()
		})

		test("renders one status badge per status using the Status Badge vocabulary (admin)", () => {
			renderTable({
				members: [
					makeMember({ id: 2, status: "ACTIVE" }),
					makeMember({ id: 3, status: "EXPIRED", first_name_th: "บ" }),
					makeMember({ id: 4, status: "PENDING_RENEWAL", first_name_th: "ค" }),
					makeMember({ id: 5, status: "RESIGNED", first_name_th: "ง" }),
				],
			})

			expect(screen.getAllByText("ปกติ")).toHaveLength(1)
			expect(screen.getAllByText("ยังไม่ได้ต่ออายุ")).toHaveLength(2)
			expect(screen.getAllByText("ลาออก")).toHaveLength(1)
		})

		test("admin mode: select-all and row checkboxes fire callbacks, delete button reports the member", () => {
			const props = renderTable()

			fireEvent.click(screen.getByRole("checkbox", { name: "เลือกทั้งหมด" }))
			expect(props.onToggleAll).toHaveBeenCalledWith(true)

			fireEvent.click(screen.getByRole("checkbox", { name: "เลือก นายสมชาย ใจดี" }))
			expect(props.onToggleOne).toHaveBeenCalledWith(1, true)

			fireEvent.click(screen.getByRole("button", { name: "ลบสมาชิก นายสมชาย ใจดี" }))
			expect(props.onDeleteClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
		})

		test("select-all shows indeterminate when only some rows are selected", () => {
			renderTable({
				members: [makeMember({ id: 1 }), makeMember({ id: 2, first_name_th: "บ" })],
				selectedIds: new Set([1]),
			})

			const selectAll = screen.getByRole("checkbox", { name: "เลือกทั้งหมด" })
			expect(selectAll.getAttribute("data-state")).toBe("indeterminate")
		})
	})

	describe("Unhappy cases", () => {
		test("non-admin: no checkbox column, no จัดการ column, no status badges", () => {
			renderTable({ isAdmin: false })

			expect(screen.queryByRole("checkbox")).not.toBeTruthy()
			expect(screen.queryByRole("columnheader", { name: "จัดการ" })).not.toBeTruthy()
			expect(screen.queryByText("ปกติ")).not.toBeTruthy()
			expect(screen.queryByRole("button", { name: /ลบสมาชิก/ })).not.toBeTruthy()
		})

		test("empty member list renders headers only, no rows", () => {
			renderTable({ members: [] })

			expect(screen.getByRole("columnheader", { name: "ชื่อ-สกุล / ตำแหน่ง" })).toBeTruthy()
			expect(screen.queryByText("นายสมชาย ใจดี")).not.toBeTruthy()
		})

		test("unknown position code falls back to the raw code", () => {
			renderTable({ members: [makeMember({ position: "FUTURE_POSITION" })] })

			expect(screen.getByText("FUTURE_POSITION")).toBeTruthy()
		})
	})
})
