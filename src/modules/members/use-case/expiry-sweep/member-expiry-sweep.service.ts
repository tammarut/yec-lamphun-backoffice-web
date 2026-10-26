import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { computeRenewalSeasonBoundary } from "src/modules/shared/membership/renewal-season"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, injectable } from "tsyringe"

import type { IMemberRepository } from "../../interfaces"

/** Request shape of {@link MemberExpirySweepService.execute}. */
export interface ExpirySweepRequest {
	/** `true` = count-only rehearsal, no mutation (ADR-0027: safe on any date). */
	dryRun: boolean
}

/** One sweep run's facts — everything the entry script's log line needs. */
export interface ExpirySweepRun {
	/** The Renewal Season boundary the predicate was keyed on. */
	boundary: Date
	/** Members expired by this run (dry-run: the would-be count). */
	expiredCount: number
	dryRun: boolean
}

/**
 * Use case (command): the Expiry Sweep — ADR-0027. Moves every live ACTIVE
 * member whose Membership Expiry precedes the Renewal Season boundary (or
 * who has no expiry at all) to EXPIRED; the first Member Status transition
 * outside the Membership Renewal lifecycle.
 *
 * Expiry-keyed and hence idempotent: a renewed member carries next year's
 * expiry and never matches, so re-running on any date is a no-op for them.
 * The boundary is derived from the injected `now` (default wall clock) via
 * the shared {@link computeRenewalSeasonBoundary} rule — never taken from a
 * caller, so cadence stays an ops knob and the service cannot be pointed at
 * an arbitrary cutoff.
 *
 * A dry-run routes to the count-only repository method and performs no
 * write; the mutating path is the repository's single atomic UPDATE (no
 * transaction wrapper). The only failure mode is infra — the repository's
 * `DatabaseError` propagates unchanged.
 *
 * Returns AGENTS.md §2B `Promise<Result<ExpirySweepRun, DatabaseError>>`.
 */
@injectable()
export class MemberExpirySweepService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.WALL_CLOCK) private readonly now: () => Date = () => new Date()
	) {}

	async execute(request: ExpirySweepRequest): Promise<Result<ExpirySweepRun, DatabaseError>> {
		const boundary = computeRenewalSeasonBoundary(this.now())

		const result = request.dryRun ? await this.repository.countMembersDueForExpiry(boundary) : await this.repository.expireMembersDueForExpiry(boundary)

		if (result.isErr()) {
			return err(result.error)
		}
		return ok({ boundary, expiredCount: result.value, dryRun: request.dryRun })
	}
}
