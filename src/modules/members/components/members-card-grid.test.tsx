import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { makeMember } from "src/modules/members/components/make-member.fixture"
import { MembersCardGrid } from "src/modules/members/components/members-card-grid"

function renderGrid(overrides: Partial<Parameters<typeof MembersCardGrid>[0]> = {}) {
	const props = {
		members: [makeMember()],
		isAdmin: true,
		onDeleteClick: vi.fn(),
		onEditClick: vi.fn(),
		...overrides,
	}
	render(<MembersCardGrid {...props} />)
	return props
}

describe("MembersCardGrid", () => {
	afterEach(cleanup)

	describe("Happy cases", () => {
		it("renders member cards: glued Thai name, nickname, position label, business, contacts", () => {
			renderGrid()

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			expect(screen.getByText("ร้านกาแฟสมชาย")).toBeTruthy()
			expect(screen.getByText("089-111-2222")).toBeTruthy()
			expect(screen.getByText("somchai@example.com")).toBeTruthy()
		})

		it("admin: the member name is a keyboard-focusable link to the detail page", () => {
			renderGrid()

			const link = screen.getByRole("link", { name: "นายสมชาย ใจดี" })
			expect(link.getAttribute("href")).toBe("/members/1")
			// The nickname sits outside the link so the accessible name stays the name alone.
			expect(link.textContent).toBe("นายสมชาย ใจดี")
			// Native <a href> — prove keyboard reachability, not just name it.
			link.focus()
			expect(document.activeElement).toBe(link)
		})

		it("admin: edit and delete buttons report the member and never navigate", () => {
			const props = renderGrid()

			fireEvent.click(screen.getByRole("button", { name: `แก้ไขข้อมูลสมาชิก นายสมชาย ใจดี` }))
			expect(props.onEditClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

			fireEvent.click(screen.getByRole("button", { name: `ลบสมาชิก นายสมชาย ใจดี` }))
			expect(props.onDeleteClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
		})

		it("renders the status badge per the Status Badge vocabulary (admin)", () => {
			renderGrid({ members: [makeMember({ status: "EXPIRED" })] })

			expect(screen.getByText("ยังไม่ได้ต่ออายุ")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("non-admin: no status badge, no edit/delete buttons", () => {
			renderGrid({ isAdmin: false })

			expect(screen.queryByText("ยังไม่ได้ต่ออายุ")).not.toBeTruthy()
			expect(screen.queryByRole("button", { name: /ลบสมาชิก/ })).not.toBeTruthy()
			expect(screen.queryByRole("button", { name: /แก้ไขข้อมูลสมาชิก/ })).not.toBeTruthy()
		})

		it("non-admin: the member name is plain text with no link affordance", () => {
			renderGrid({ isAdmin: false })

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.queryByRole("link")).not.toBeTruthy()
		})

		it("empty business description renders the dash placeholder", () => {
			renderGrid({ members: [makeMember({ business: { name: "ร้านกาแฟสมชาย", description: "" } })] })

			expect(screen.getByText("-")).toBeTruthy()
		})
	})
})
