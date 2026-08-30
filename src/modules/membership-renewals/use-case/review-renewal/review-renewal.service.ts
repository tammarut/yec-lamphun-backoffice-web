import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { RenewalNotFoundError, type ReviewRenewalError } from "./review-renewal.errors"
import type { ReviewRenewalRequest } from "./review-renewal.types"

/**
 * Use case: review a pending membership renewal
 * (PATCH /api/v1/membership/renewals/{renewal_id}/review, ADR-0018).
 *
 * An orchestrator, nothing more: the transition rule lives on the aggregate
 * ({@link MembershipRenewal.fromDb} + `review()`), and atomicity lives in the
 * repository ({@link IMembershipRenewalRepository.applyReview}). The flow
 * mirrors the create-renewal convention (grilling decision 1):
 *
 *   1. Pre-check read OUTSIDE the transaction — null → 404 fast path; a
 *      terminal status surfaces here for the clean 409 (the race is closed by
 *      the repository's guarded UPDATE, not this read).
 *   2. `fromDb` → `review()` — the domain decides and computes the outcome
 *      (status pair, rejection reason, Membership Expiry on approve).
 *   3. `applyReview` — one transaction: guarded renewal UPDATE, then the
 *      member-side write (approve reuses the manual flow's four-column UPDATE;
 *      reject writes the two-column EXPIRED one).
 *
 * The route is wrapped in `withAuth`, so reaching this code proves the caller
 * is staff — there is no auth branching here (same contract as the manual
 * create flow, ADR-0016).
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<void, ReviewRenewalError>>`
 * — void because success is 204 No Content.
 */
@singleton()
export class ReviewRenewalService {
	constructor(@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository) {}

	async execute(req: ReviewRenewalRequest): Promise<Result<void, ReviewRenewalError>> {
		// 1. Pre-check read (outside the tx). The row feeds fromDb directly; null
		//    means the renewal does not exist or is soft-deleted → 404.
		const rowResult = await this.repository.getRenewalForReview(req.renewalId)
		if (rowResult.isErr()) {
			return err(rowResult.error)
		}
		const row = rowResult.value
		if (row === null) {
			return err(new RenewalNotFoundError())
		}

		// 2. The domain owns the transition: only PENDING_REVIEW may be decided,
		//    and the outcome (not the service) carries the status pair, reason,
		//    and the computed Membership Expiry on approve.
		const renewal = MembershipRenewal.fromDb(row)
		const outcomeResult = renewal.review({ decision: req.decision, reason: req.reason, now: new Date() })
		if (outcomeResult.isErr()) {
			// Terminal status — the clean 409 (the racy twin fires in applyReview).
			return err(outcomeResult.error)
		}

		// 3. Persist atomically. A renewal decided by a concurrent review makes
		//    the guarded UPDATE match zero rows → RenewalAlreadyReviewedError.
		const applyResult = await this.repository.applyReview(outcomeResult.value)
		if (applyResult.isErr()) {
			return err(applyResult.error)
		}

		return ok(undefined)
	}
}
