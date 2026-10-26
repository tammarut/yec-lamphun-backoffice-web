import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, injectable } from "tsyringe"

import type { IAnnualMembershipExpiryRepository } from "../../interfaces"
import { computeRenewalSeasonBoundary } from "./renewal-season"

/** Request shape of {@link AnnualMembershipExpiryService.execute}. */
export interface AnnualMembershipExpiryRequest {
	/** `true` = count-only rehearsal, no mutation (ADR-0027: safe on any date). */
	dryRun: boolean
}

/** One run's facts — everything the entry script's log line needs. */
export interface AnnualMembershipExpiryRun {
	/** The Renewal Season boundary the predicate was keyed on. */
	boundary: Date
	/** Members expired by this run (dry-run: the would-be count). */
	expiredCount: number
	dryRun: boolean
}

/**
 * Use case (command): the Annual Membership Expiry — ADR-0027. Moves every
 * live ACTIVE member whose Membership Expiry precedes the Renewal Season
 * boundary to EXPIRED; the first Member Status transition outside the
 * Membership Renewal lifecycle. A NULL `expires_at` is deliberately never
 * matched — a missing expiry is a legacy data anomaly handled out-of-band,
 * not auto-expired (repo-review ruling, PR #109).
 *
 * Expiry-keyed and hence idempotent: a renewed member carries next year's
 * expiry and never matches, so re-running on any date is a no-op for them.
 * The boundary is derived from the injected `now` (default wall clock) via
 * the colocated {@link computeRenewalSeasonBoundary} rule — never taken from
 * a caller, so cadence stays an ops knob and the service cannot be pointed
 * at an arbitrary cutoff.
 *
 * A dry-run routes to the count-only repository method and performs no
 * write; the mutating path is the repository's single atomic UPDATE (no
 * transaction wrapper). The only failure mode is infra — the repository's
 * `DatabaseError` propagates unchanged.
 *
 * Returns AGENTS.md §2B
 * `Promise<Result<AnnualMembershipExpiryRun, DatabaseError>>`.
 */
@injectable()
export class AnnualMembershipExpiryService {
	constructor(
		@inject(REGISTER_KEY.ANNUAL_MEMBERSHIP_EXPIRY_REPOSITORY) private readonly repository: IAnnualMembershipExpiryRepository,
		@inject(REGISTER_KEY.WALL_CLOCK) private readonly now: () => Date = () => new Date()
	) {}

	async execute(request: AnnualMembershipExpiryRequest): Promise<Result<AnnualMembershipExpiryRun, DatabaseError>> {
		const boundary = computeRenewalSeasonBoundary(this.now())

		const result = request.dryRun ? await this.repository.countMembersDueForAnnualExpiry(boundary) : await this.repository.expireMembersDueForAnnualExpiry(boundary)

		if (result.isErr()) {
			return err(result.error)
		}
		return ok({ boundary: boundary, expiredCount: result.value, dryRun: request.dryRun })
	}
}
