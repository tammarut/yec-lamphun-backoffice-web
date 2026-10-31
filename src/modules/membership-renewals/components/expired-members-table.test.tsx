import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ExpiredMembersTable } from "src/modules/membership-renewals/components/expired-members-table"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

// jsdom lacks the pointer-capture + scrollIntoView APIs the Radix dropdown
// menu relies on (first dropdown-menu usage in the codebase).
beforeAll(() => {
	Element.prototype.hasPointerCapture = () => false
	Element.prototype.setPointerCapture = () => undefined
	Element.prototype.releasePointerCapture = () => undefined
	Element.prototype.scrollIntoView = () => undefined
})

afterEach(() => {
	cleanup()
})

describe("ExpiredMembersTable", () => {
	describe("Happy cases", () => {
		it("renders member identity, position label, and วันที่เป็นสมาชิก as a Thai date", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[makeExpiredMembership({ id: 201, position: "GENERAL_MEMBER", member_since: "2024-06-01T00:00:00.000Z" })]} />)

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("081-234-5678")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			expect(screen.getByText("1 มิ.ย. 2567")).toBeTruthy()
			expect(screen.getByText("วันที่เป็นสมาชิก")).toBeTruthy()
		})

		it("admin: the ดำเนินการ column renders ต่ออายุ (Manual) firing the callback", () => {
			const onManualRenew = vi.fn()
			render(<ExpiredMembersTable isAdmin={true} onManualRenew={onManualRenew} members={[makeExpiredMembership({ id: 201 })]} />)

			expect(screen.getByText("ดำเนินการ")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: /ต่ออายุแบบผู้ดูแลระบบให้ นายสมชาย ใจดี/ }))
			expect(onManualRenew).toHaveBeenCalledTimes(1)
			expect(onManualRenew.mock.calls[0]?.[0]?.id).toBe(201)
		})

		it("admin: the kebab opens a menu whose ลาออก item fires onResign with the member", async () => {
			const onResign = vi.fn()
			render(<ExpiredMembersTable isAdmin={true} onManualRenew={vi.fn()} onResign={onResign} members={[makeExpiredMembership({ id: 201 })]} />)

			fireEvent.pointerDown(screen.getByRole("button", { name: /ตัวเลือกเพิ่มเติมสำหรับ นายสมชาย ใจดี/ }))

			const item = await screen.findByRole("menuitem", { name: /ลาออกให้ นายสมชาย ใจดี/ })
			expect(screen.getByText("ลาออก")).toBeTruthy()
			fireEvent.pointerUp(item)
			fireEvent.click(item)
			expect(onResign).toHaveBeenCalledTimes(1)
			expect(onResign.mock.calls[0]?.[0]?.id).toBe(201)
		})

		it("admin: the ลาออก menu item renders with the destructive variant", async () => {
			render(<ExpiredMembersTable isAdmin={true} onResign={vi.fn()} members={[makeExpiredMembership({ id: 201 })]} />)

			fireEvent.pointerDown(screen.getByRole("button", { name: /ตัวเลือกเพิ่มเติมสำหรับ นายสมชาย ใจดี/ }))
			const item = await screen.findByRole("menuitem", { name: /ลาออกให้ นายสมชาย ใจดี/ })
			expect(item.getAttribute("data-variant")).toBe("destructive")
		})
	})

	describe("Unhappy cases", () => {
		it("renders the ไม่พบข้อมูล empty row when the slice is empty", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[]} />)

			expect(screen.getByText("ไม่พบข้อมูล")).toBeTruthy()
		})

		it("member view: no ดำเนินการ column, no manual action, and no kebab", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[makeExpiredMembership()]} />)

			expect(screen.queryByText("ดำเนินการ")).toBeNull()
			expect(screen.queryByRole("button", { name: /ต่ออายุ/ })).toBeNull()
			expect(screen.queryByRole("button", { name: /ตัวเลือกเพิ่มเติม/ })).toBeNull()
		})

		it("admin with no onResign: the kebab stays hidden (expired-table-only scope)", () => {
			render(<ExpiredMembersTable isAdmin={true} onManualRenew={vi.fn()} members={[makeExpiredMembership()]} />)

			expect(screen.queryByRole("button", { name: /ตัวเลือกเพิ่มเติม/ })).toBeNull()
		})
	})
})
