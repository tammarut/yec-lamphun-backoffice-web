import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ResignMemberDialog } from "src/modules/membership-renewals/components/resign-member-dialog"
import { makeExpiredMembership } from "src/modules/membership-renewals/components/make-expired-membership.fixture"

afterEach(() => {
	cleanup()
})

describe("ResignMemberDialog", () => {
	describe("Happy cases", () => {
		it("renders nothing when the target member is null", () => {
			render(<ResignMemberDialog member={null} isResigning={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)

			expect(screen.queryByRole("alertdialog")).toBeNull()
		})

		it("names the member and warns that the action is irreversible", async () => {
			render(<ResignMemberDialog member={makeExpiredMembership({ id: 101 })} isResigning={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)

			expect(await screen.findByText("ยืนยันการลาออก")).toBeTruthy()
			expect(screen.getByText(/นายสมชาย ใจดี/)).toBeTruthy()
			expect(screen.getByText(/ไม่สามารถย้อนกลับได้/)).toBeTruthy()
		})

		it("confirm hands off to onConfirm and keeps the dialog open (no direct close)", () => {
			const onConfirm = vi.fn()
			const onOpenChange = vi.fn()
			render(<ResignMemberDialog member={makeExpiredMembership({ id: 101 })} isResigning={false} onOpenChange={onOpenChange} onConfirm={onConfirm} />)

			fireEvent.click(screen.getByRole("button", { name: "ยืนยันลาออก" }))

			expect(onConfirm).toHaveBeenCalledTimes(1)
			expect(screen.getByRole("alertdialog")).toBeTruthy()
			expect(onOpenChange).not.toHaveBeenCalled()
		})

		it("cancel asks the parent to close via onOpenChange(false)", () => {
			const onOpenChange = vi.fn()
			render(<ResignMemberDialog member={makeExpiredMembership({ id: 101 })} isResigning={false} onOpenChange={onOpenChange} onConfirm={vi.fn()} />)

			fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }))

			expect(onOpenChange).toHaveBeenCalledWith(false)
		})
	})

	describe("Unhappy cases", () => {
		it("pending state swaps the label to กำลังบันทึก... and disables both buttons", () => {
			render(<ResignMemberDialog member={makeExpiredMembership({ id: 101 })} isResigning={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)

			const confirm = screen.getByRole("button", { name: "กำลังบันทึก..." })
			expect((confirm as HTMLButtonElement).disabled).toBe(true)
			expect((screen.getByRole("button", { name: "ยกเลิก" }) as HTMLButtonElement).disabled).toBe(true)
		})
	})
})
