import { describe, expect, test } from "vitest"
import { MembershipRenewal } from "./membership-renewal"

const baseInput = {
	memberId: 15,
	paymentSlipFilePath: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
	now: new Date("2026-08-07T10:00:00Z"),
}

describe("MembershipRenewal.create", () => {
	describe("Happy cases", () => {
		test("public submission (isAdmin=false) -> PENDING_REVIEW / PENDING_RENEWAL", () => {
			const result = MembershipRenewal.create({ ...baseInput, isAdmin: false })

			expect(result.isOk()).toBe(true)
			const renewal = result._unsafeUnwrap()
			expect(renewal.status).toBe("PENDING_REVIEW")
			expect(renewal.memberStatusOnRenewal).toBe("PENDING_RENEWAL")
		})

		test("admin submission (isAdmin=true) -> APPROVED / ACTIVE (instant approval)", () => {
			const result = MembershipRenewal.create({ ...baseInput, isAdmin: true })

			expect(result.isOk()).toBe(true)
			const renewal = result._unsafeUnwrap()
			expect(renewal.status).toBe("APPROVED")
			expect(renewal.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("stamps paymentDateAt from server time, not the request", () => {
			const now = new Date("2030-01-15T09:30:00Z")
			const result = MembershipRenewal.create({ ...baseInput, isAdmin: false, now })

			expect(result._unsafeUnwrap().paymentDateAt).toBe(now)
		})

		test("exposes all props via getters (persistence-ready)", () => {
			const result = MembershipRenewal.create({ ...baseInput, isAdmin: true })

			const renewal = result._unsafeUnwrap()
			expect(renewal.memberId).toBe(15)
			expect(renewal.paymentSlipFilePath).toBe(baseInput.paymentSlipFilePath)
			expect(renewal.paymentDateAt).toBe(baseInput.now)
			expect(renewal.status).toBe("APPROVED")
			expect(renewal.memberStatusOnRenewal).toBe("ACTIVE")
		})
	})

	describe("Status-pair rule coverage (ADR-0015)", () => {
		// Exhaustive table over the only input that changes the status pair.
		test.each([
			{ isAdmin: false, renewal: "PENDING_REVIEW", member: "PENDING_RENEWAL" },
			{ isAdmin: true, renewal: "APPROVED", member: "ACTIVE" },
		] as const)("isAdmin=$isAdmin -> renewal=$renewal, member=$member", ({ isAdmin, renewal, member }) => {
			const result = MembershipRenewal.create({ ...baseInput, isAdmin })

			expect(result._unsafeUnwrap().status).toBe(renewal)
			expect(result._unsafeUnwrap().memberStatusOnRenewal).toBe(member)
		})
	})
})
