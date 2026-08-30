import { describe, expect, test } from "vitest"
import { RenewalAlreadyReviewedError } from "../use-case/review-renewal/review-renewal.errors"
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

describe("MembershipRenewal.createManual", () => {
	describe("Happy cases", () => {
		test("manual submission is always APPROVED / ACTIVE (staff instant approval)", () => {
			const result = MembershipRenewal.createManual({ ...baseInput })

			expect(result.isOk()).toBe(true)
			const renewal = result._unsafeUnwrap()
			expect(renewal.status).toBe("APPROVED")
			expect(renewal.memberStatusOnRenewal).toBe("ACTIVE")
		})

		test("carries memberId + paymentSlip and stamps paymentDateAt from server-now", () => {
			const now = new Date("2030-01-15T09:30:00Z")
			const result = MembershipRenewal.createManual({ memberId: 42, paymentSlipFilePath: "slip.webp", now })

			const renewal = result._unsafeUnwrap()
			expect(renewal.memberId).toBe(42)
			expect(renewal.paymentSlipFilePath).toBe("slip.webp")
			expect(renewal.paymentDateAt).toBe(now)
		})

		test("does NOT expose expiresAt on the public factory output", () => {
			// The public create() must stay unaffected: no expiresAt.
			const result = MembershipRenewal.create({ ...baseInput, isAdmin: true })

			expect(result._unsafeUnwrap().expiresAt).toBeUndefined()
		})
	})

	describe("Membership Expiry rule (ADR-0016)", () => {
		// The shared end-of-next-year formula, pinned across calendar-year edges.
		test.each([
			{ now: new Date("2026-06-15T10:00:00Z"), expected: "2027-12-31T23:59:59.999Z", label: "mid-2026" },
			{ now: new Date("2026-12-31T23:00:00Z"), expected: "2027-12-31T23:59:59.999Z", label: "last day of 2026" },
			{ now: new Date("2027-01-01T00:00:00Z"), expected: "2028-12-31T23:59:59.999Z", label: "first day of 2027" },
		])("expiresAt for $label -> $expected", ({ now, expected }) => {
			const renewal = MembershipRenewal.createManual({ ...baseInput, now })._unsafeUnwrap()

			expect(renewal.expiresAt?.toISOString()).toBe(expected)
		})
	})
})

describe("MembershipRenewal.review (ADR-0018)", () => {
	const now = new Date("2026-08-30T09:00:00Z")
	const pendingRow = { id: 79, memberId: 15, status: "PENDING_REVIEW" } as const

	describe("Happy cases", () => {
		test("approve a PENDING_REVIEW renewal -> APPROVED outcome, member ACTIVE, expiry re-stamped, no reason", () => {
			const renewal = MembershipRenewal.fromDb({ ...pendingRow })

			const result = renewal.review({ decision: "APPROVED", reason: null, now })

			expect(result.isOk()).toBe(true)
			const outcome = result._unsafeUnwrap()
			expect(outcome.renewalId).toBe(79)
			expect(outcome.memberId).toBe(15)
			expect(outcome.status).toBe("APPROVED")
			expect(outcome.rejectionReason).toBeNull()
			expect(outcome.reviewedAt).toBe(now)
			expect(outcome.memberStatus).toBe("ACTIVE")
			// Same shared rule the manual factory uses: end of NEXT calendar year.
			expect(outcome.expiresAt?.toISOString()).toBe("2027-12-31T23:59:59.999Z")
		})

		test("reject a PENDING_REVIEW renewal -> REJECTED outcome, member EXPIRED, reason carried, no expiry", () => {
			const renewal = MembershipRenewal.fromDb({ ...pendingRow })

			const result = renewal.review({ decision: "REJECTED", reason: "สลิปไม่ชัด", now })

			expect(result.isOk()).toBe(true)
			const outcome = result._unsafeUnwrap()
			expect(outcome.status).toBe("REJECTED")
			expect(outcome.rejectionReason).toBe("สลิปไม่ชัด")
			expect(outcome.memberStatus).toBe("EXPIRED")
			expect(outcome.expiresAt).toBeUndefined()
		})

		test("Membership Expiry is pinned across calendar-year edges on the review path too", () => {
			const renewal = MembershipRenewal.fromDb({ ...pendingRow })
			const at = new Date("2027-01-01T00:00:00Z")

			const outcome = renewal.review({ decision: "APPROVED", reason: null, now: at })._unsafeUnwrap()

			expect(outcome.expiresAt?.toISOString()).toBe("2028-12-31T23:59:59.999Z")
		})
	})

	describe("Unhappy cases", () => {
		// Exhaustive over the terminal statuses — the transition rule (ADR-0018).
		test.each(["APPROVED", "REJECTED"] as const)("already-$0 renewal cannot be reviewed again -> RenewalAlreadyReviewedError", (status) => {
			const renewal = MembershipRenewal.fromDb({ id: 79, memberId: 15, status })

			const result = renewal.review({ decision: "REJECTED", reason: "late second look", now })

			expect(result.isErr()).toBe(true)
			const error = result._unsafeUnwrapErr()
			expect(error).toBeInstanceOf(RenewalAlreadyReviewedError)
			expect(error.message).toBe("This renewal has been reviewed")
		})
	})
})
