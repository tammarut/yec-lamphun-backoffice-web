import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ExpiredMembersTable } from "src/modules/membership-renewals/components/expired-members-table"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

afterEach(() => {
	cleanup()
})

describe("ExpiredMembersTable", () => {
	describe("Happy cases", () => {
		test("renders member identity, position label, and วันที่เป็นสมาชิก as a Thai date", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[makeExpiredMembership({ id: 201, position: "GENERAL_MEMBER", member_since: "2024-06-01T00:00:00.000Z" })]} />)
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("081-234-5678")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			expect(screen.getByText("1 มิ.ย. 2567")).toBeTruthy()
			expect(screen.getByText("วันที่เป็นสมาชิก")).toBeTruthy()
		})

		test("admin: the ดำเนินการ column renders ต่ออายุ (Manual) firing the callback", () => {
			const onManualRenew = vi.fn()
			render(<ExpiredMembersTable isAdmin={true} onManualRenew={onManualRenew} members={[makeExpiredMembership({ id: 201 })]} />)

			expect(screen.getByText("ดำเนินการ")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: /ต่ออายุแบบผู้ดูแลระบบให้ นายสมชาย ใจดี/ }))
			expect(onManualRenew).toHaveBeenCalledTimes(1)
			expect(onManualRenew.mock.calls[0]?.[0]?.id).toBe(201)
		})
	})

	describe("Unhappy cases", () => {
		test("renders the ไม่พบข้อมูล empty row when the slice is empty", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[]} />)
			expect(screen.getByText("ไม่พบข้อมูล")).toBeTruthy()
		})

		test("member view: no ดำเนินการ column and no manual action", () => {
			render(<ExpiredMembersTable isAdmin={false} members={[makeExpiredMembership()]} />)
			expect(screen.queryByText("ดำเนินการ")).toBeNull()
			expect(screen.queryByRole("button", { name: /ต่ออายุ/ })).toBeNull()
		})
	})
})
