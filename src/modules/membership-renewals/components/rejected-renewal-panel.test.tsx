import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { RejectedRenewalPanel } from "src/modules/membership-renewals/components/rejected-renewal-panel"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

function rejectedRow(overrides: Partial<Parameters<typeof makeExpiredMembership>[0]> = {}) {
	return makeExpiredMembership({
		latest_renewal_status: "REJECTED",
		rejection_reason: "สลิปไม่ชัดเจน กรุณาส่งใหม่",
		rejected_at: "2026-08-12T00:00:00.000Z",
		...overrides,
	})
}

/** The panel renders rows inside a data-slot container — RTL's ByTestId queries would look for data-testid and never find it. */
function queryRowsContainer(container: HTMLElement): Element | null {
	return container.querySelector('[data-slot="rejected-renewal-rows"]')
}

afterEach(() => {
	cleanup()
})

describe("RejectedRenewalPanel", () => {
	describe("Happy cases", () => {
		test("admin: red header with tracking copy, count badge, and reason lines on rows", () => {
			const { container } = render(
				<RejectedRenewalPanel
					rejectedRows={[rejectedRow({ id: 101, nickname: "ชาย" }), rejectedRow({ id: 102, first_name_th: "สมหญิง", nickname: "หญิง" })]}
					isAdmin={true}
					expanded={true}
					onToggleExpanded={() => {}}
				/>
			)
			expect(screen.getByText("ไม่อนุมัติ — ต้องติดตาม")).toBeTruthy()
			expect(screen.getByText("คำขอต่ออายุที่ถูกไม่อนุมัติ ต้องติดต่อสมาชิกเพื่อดำเนินการใหม่")).toBeTruthy()
			expect(screen.getByText("2 ราย")).toBeTruthy()
			expect(queryRowsContainer(container)).toBeTruthy()
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getAllByText("12 ส.ค. 2569")).toHaveLength(2)
			expect(screen.getAllByText("สลิปไม่ชัดเจน กรุณาส่งใหม่")).toHaveLength(2)
		})

		test("admin: row actions ดูสลิป/เหตุผล + ต่ออายุ (Manual) fire their callbacks with the row", () => {
			const onViewReview = vi.fn()
			const onManualRenew = vi.fn()
			render(
				<RejectedRenewalPanel
					rejectedRows={[rejectedRow({ id: 101, nickname: "ชาย" })]}
					isAdmin={true}
					expanded={true}
					onToggleExpanded={() => {}}
					onViewReview={onViewReview}
					onManualRenew={onManualRenew}
				/>
			)

			fireEvent.click(screen.getByRole("button", { name: /ดูสลิป\/เหตุผลของ นายสมชาย ใจดี/ }))
			expect(onViewReview).toHaveBeenCalledTimes(1)
			expect(onViewReview.mock.calls[0]?.[0]?.id).toBe(101)

			fireEvent.click(screen.getByRole("button", { name: /ต่ออายุแบบผู้ดูแลระบบให้ นายสมชาย ใจดี/ }))
			expect(onManualRenew).toHaveBeenCalledTimes(1)
			expect(onManualRenew.mock.calls[0]?.[0]?.id).toBe(101)
		})

		test("member: contact-staff pill wording and no เหตุผล line", () => {
			render(<RejectedRenewalPanel rejectedRows={[rejectedRow()]} isAdmin={false} expanded={true} onToggleExpanded={() => {}} />)
			expect(screen.getByText("ไม่อนุมัติ — กรุณาติดต่อเจ้าหน้าที่")).toBeTruthy()
			expect(screen.getByText("กรุณาติดต่อเจ้าหน้าที่")).toBeTruthy()
			expect(screen.queryByText(/เหตุผล:/)).toBeNull()
		})

		test("zero rows: green all-clear header with the audience subtitle and no rows", () => {
			const { container } = render(<RejectedRenewalPanel rejectedRows={[]} isAdmin={true} expanded={false} onToggleExpanded={() => {}} />)
			expect(screen.getByText("จัดการคำขอทั้งหมดแล้ว")).toBeTruthy()
			expect(screen.getByText("0 ราย")).toBeTruthy()
			expect(queryRowsContainer(container)).toBeNull()
		})

		test("header click asks the parent to toggle when there are rows", () => {
			const onToggleExpanded = vi.fn()
			render(<RejectedRenewalPanel rejectedRows={[rejectedRow()]} isAdmin={true} expanded={true} onToggleExpanded={onToggleExpanded} />)
			screen.getByRole("button", { name: /ไม่อนุมัติ — ต้องติดตาม/ }).click()
			expect(onToggleExpanded).toHaveBeenCalledTimes(1)
		})

		test("header click is a no-op on the green all-clear board (not collapsible)", () => {
			const onToggleExpanded = vi.fn()
			render(<RejectedRenewalPanel rejectedRows={[]} isAdmin={true} expanded={false} onToggleExpanded={onToggleExpanded} />)
			screen.getByRole("button", { name: /ไม่อนุมัติ — ต้องติดตาม/ }).click()
			expect(onToggleExpanded).not.toHaveBeenCalled()
		})
	})

	describe("Unhappy cases", () => {
		test("null rejected_at and null reason render as dashes instead of crashing", () => {
			render(<RejectedRenewalPanel rejectedRows={[rejectedRow({ rejected_at: null, rejection_reason: null })]} isAdmin={true} expanded={true} onToggleExpanded={() => {}} />)
			expect(screen.getAllByText("-").length).toBeGreaterThan(0)
		})

		test("member view: no row actions even when callbacks are provided", () => {
			render(
				<RejectedRenewalPanel rejectedRows={[rejectedRow()]} isAdmin={false} expanded={true} onToggleExpanded={() => {}} onViewReview={() => {}} onManualRenew={() => {}} />
			)
			expect(screen.queryByRole("button", { name: /ดูสลิป\/เหตุผล/ })).toBeNull()
			expect(screen.queryByRole("button", { name: /ต่ออายุ \(Manual\)/ })).toBeNull()
		})
	})
})
