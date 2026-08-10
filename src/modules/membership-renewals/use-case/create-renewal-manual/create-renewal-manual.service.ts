import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError, type CreateManualRenewalError } from "./create-renewal-manual.errors"
import type { CreateManualRenewalRequest } from "./create-renewal-manual.types"

/**
 * Use case: create a new MANUAL membership renewal
 * (POST /api/v1/membership/renewals/manual).
 *
 * Shares the member-status domain pre-check with the public
 * {@link CreateRenewalService} (same 404/403/409 early exits), reusing the same
 * repository read (`getMemberStatusForRenewal`) and the same error vocabulary.
 * What is DIFFERENT is the write: a manual renewal is always a staff (Admin)
 * submission AND advances the membership clock — it bumps
 * `renewal_successful_count` and sets `expires_at` to the Membership Expiry
 * (end of next year). That clock-advancing write is owned by the manual
 * repository method {@link IMembershipRenewalRepository.createManualRenewal}
 * (ADR-0016).
 *
 * The service has no `isAdmin` input: the route is wrapped in `withAuth`, so
 * reaching this code PROVES the caller is staff. It assembles the aggregate via
 * {@link MembershipRenewal.createManual} (fixed APPROVED/ACTIVE pair + the
 * computed expiresAt) and passes it to the repository, which owns the
 * cross-table transaction (INSERT renewal + UPDATE the four member cache
 * columns, ADR-0014/ADR-0016).
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<number, CreateManualRenewalError>>`.
 */
@singleton()
export class CreateManualRenewalService {
	constructor(@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository) {}

	async execute(req: CreateManualRenewalRequest): Promise<Result<number, CreateManualRenewalError>> {
		// 1. Pre-check the member's status (outside the tx) — IDENTICAL to the
		//    public create-renewal flow. One read drives the same early exits;
		//    the write path below assumes an eligible member.
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

		// 2. Assemble the aggregate via the MANUAL factory. It fixes the status
		//    pair (APPROVED / ACTIVE) — the route's withAuth already proved
		//    staff — and computes the new expiresAt via the shared Membership
		//    Expiry rule. Returns ok unconditionally today.
		const renewalResult = MembershipRenewal.createManual({
			memberId: req.memberId,
			paymentSlipFilePath: req.paymentSlip,
			now: new Date(),
		})
		if (renewalResult.isErr()) {
			return err(renewalResult.error)
		}
		const renewal = renewalResult.value

		// 3. Persist atomically. The manual write owns its own transaction
		//    (INSERT renewal + UPDATE member status, latest_renewal_status,
		//    expires_at, renewal_successful_count). Unlike the public write,
		//    the INSERT here is status='APPROVED' and excluded from the partial
		//    unique index, so this method returns only ok(id) | err(DatabaseError).
		const createResult = await this.repository.createManualRenewal(renewal)
		if (createResult.isErr()) {
			return err(createResult.error)
		}

		return ok(createResult.value)
	}
}
