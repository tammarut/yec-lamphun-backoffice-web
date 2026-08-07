import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError, type CreateRenewalError } from "./create-renewal.errors"
import type { CreateRenewalRequest } from "./create-renewal.types"

/**
 * Use case: create a new membership renewal request
 * (POST /api/v1/membership/renewals).
 *
 * Owns the member-status domain rules that gate renewal creation:
 *   - member not found / soft-deleted → 404
 *   - member.status = RESIGNED → 403
 *   - member.status = PENDING_RENEWAL → 409 (already has a pending renewal)
 *
 * These run as a cheap pre-check READ outside the transaction, mirroring how
 * {@link CreateNewMemberService} runs its duplicate-id_card / position checks
 * before the atomic write. The repository then owns the cross-table transaction
 * (INSERT renewal + UPDATE member cache columns, ADR-0014) and catches the pg
 * 23505 unique_violation as a race-condition net that maps to the same 409.
 *
 * The member.status values ACTIVE / EXPIRED both proceed to renewal creation —
 * an EXPIRED member filing a renewal is the expected path back to ACTIVE.
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<number, CreateRenewalError>>`.
 */
@singleton()
export class CreateRenewalService {
	constructor(@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository) {}

	async execute(req: CreateRenewalRequest): Promise<Result<number, CreateRenewalError>> {
		// 1. Pre-check the member's status (outside the tx). One read drives all
		//    three early-exit branches; the write path below assumes an eligible member.
		const statusResult = await this.repository.getMemberStatusForRenewal(req.memberId)
		if (statusResult.isErr()) {
			return err(statusResult.error)
		}
		const status = statusResult.value
		if (status === null) {
			return err(new MemberNotFoundError())
		}
		if (status === "RESIGNED") {
			return err(new ResignedMemberError())
		}
		if (status === "PENDING_RENEWAL") {
			return err(new PendingRenewalExistsError())
		}
		// ACTIVE / EXPIRED proceed.

		// 2. Persist atomically — the transaction + the 23505 race-catch are
		//    internal details of the repository. One call, returns ok(id) or
		//    err(PendingRenewalExistsError | DatabaseError).
		const createResult = await this.repository.createRenewal(req.memberId, req.paymentSlip)
		if (createResult.isErr()) {
			return err(createResult.error)
		}

		return ok(createResult.value)
	}
}
