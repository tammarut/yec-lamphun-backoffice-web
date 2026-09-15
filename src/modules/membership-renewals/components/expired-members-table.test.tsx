import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { ExpiredMembersTable } from "src/modules/membership-renewals/components/expired-members-table"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

afterEach(() => {
	cleanup()
})

describe("ExpiredMembersTable", () => {
	describe("Happy cases", () => {
		test("renders member identity, position label, and วันที่เป็นสมาชิก as a Thai date", () => {
			render(<ExpiredMembersTable members={[makeExpiredMembership({ id: 201, position: "GENERAL_MEMBER", member_since: "2024-06-01T00:00:00.000Z" })]} />)
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("081-234-5678")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป")).toBeTruthy()
			expect(screen.getByText("1 มิ.ย. 2567")).toBeTruthy()
			expect(screen.getByText("วันที่เป็นสมาชิก")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		test("renders the ไม่พบข้อมูล empty row when the slice is empty", () => {
			render(<ExpiredMembersTable members={[]} />)
			expect(screen.getByText("ไม่พบข้อมูล")).toBeTruthy()
		})
	})
})
