import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import type { IMembershipRenewalRepository } from "../../interfaces"
import type { RenewalStatResponse, RenewalStatRow } from "./get-renewal-stat.types"

/**
 * Use case (query): the Renewal Stat — the three badge counts above the
 * backoffice renewal-review table, served by GET /api/v1/membership/renewals/stat.
 *
 * A read-only orchestrator over a single collaborator:
 * {@link IMembershipRenewalRepository.getRenewalStat} — the module's first
 * STATIC read, owned by sqlc per ADR-0010's letter (zero parameters, nothing
 * dynamic; the two list reads are dynamic, hence Bun SQL native). One
 * aggregated `COUNT(*) FILTER` query over the members table, reading only the
 * Renewal Cache Columns.
 *
 * The service itself is pure mapping: repo row → response DTO. There is no
 * filter to build, no cursor to validate, and no domain error to surface — the
 * only failure mode is infra (`DatabaseError`), which propagates unchanged for
 * the route to map to 500.
 *
 * Returns AGENTS.md §2B
 * `Promise<Result<RenewalStatResponse, DatabaseError>>`.
 */
@singleton()
export class GetRenewalStatService {
	constructor(@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository) {}

	async execute(): Promise<Result<RenewalStatResponse, DatabaseError>> {
		const statResult = await this.repository.getRenewalStat()
		if (statResult.isErr()) {
			return err(statResult.error)
		}

		return ok(this.toResponse(statResult.value))
	}

	/** Map the repo row to its snake_case wire DTO. */
	private toResponse(row: RenewalStatRow): RenewalStatResponse {
		return {
			total_expired_members: row.totalExpiredMembers,
			total_pending_review_members: row.totalPendingReviewMembers,
			total_approved_members: row.totalApprovedMembers,
		}
	}
}
