import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IIdGenerator } from "src/modules/shared/id-generator"
import { inject, injectable } from "tsyringe"
import { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError, type CreateManualRenewalError } from "./create-renewal-manual.errors"
import type { CreateManualRenewalRequest, CreateManualRenewalResult } from "./create-renewal-manual.types"

/**
 * Use case: create the MANUAL membership renewal(s) for ONE staff submission
 * (POST /api/v1/membership/renewals/manual) — bulk-aware, mirroring the public
 * {@link CreateRenewalService} (ADR-0026): 1..6 members per request, one
 * renewal row per member, all sharing the payment slip, ONE server-stamped
 * payment date, and — at N>1 — ONE minted Renewal Group marker.
 *
 * Runs the member-status domain pre-check in ONE batched read over the whole
 * member_ids array; the first ineligible member — in request order — aborts the
 * whole submission with that member named in the error message:
 *   - member not found / soft-deleted → 404
 *   - member.status = RESIGNED → 403
 *   - member.status = PENDING_RENEWAL → 409 (already has a pending renewal)
 *
 * This pre-check is ALSO the manual path's only 409: the manual INSERT is
 * status='APPROVED', excluded from the partial unique index
 * idx_one_pending_renewal_per_member, so no 23505 race exists on this flow
 * (unlike the public path).
 *
 * What is DIFFERENT from the public flow is the write: a manual renewal is
 * always a staff (Admin) submission AND advances every member's membership
 * clock — it bumps `renewal_successful_count` and sets `expires_at` to the
 * Membership Expiry (end of next year). The clock-advancing write is owned by
 * the manual repository method {@link IMembershipRenewalRepository.createManualRenewals}
 * (ADR-0016), inside ONE all-or-nothing transaction.
 *
 * The service has no `isAdmin` input: the route is wrapped in `withAuth`, so
 * reaching this code PROVES the caller is staff. It assembles one aggregate per
 * member via {@link MembershipRenewal.createManual} (fixed APPROVED/ACTIVE pair
 * + the computed expiresAt) and passes them to the repository.
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<CreateManualRenewalResult, CreateManualRenewalError>>`.
 */
@injectable()
export class CreateManualRenewalService {
	constructor(
		@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository,
		@inject(REGISTER_KEY.UUID_ID_GENERATOR) private readonly idGenerator: IIdGenerator
	) {}

	async execute(req: CreateManualRenewalRequest): Promise<Result<CreateManualRenewalResult, CreateManualRenewalError>> {
		// 1. Pre-check every member's status in ONE batched read (outside the tx).
		//    The first ineligible member — in request order — aborts the whole
		//    submission, named in the error message (ADR-0026); same vocabulary
		//    as the public flow.
		const statusResult = await this.repository.getMemberStatusesForRenewal(req.memberIds)
		if (statusResult.isErr()) {
			return err(statusResult.error)
		}
		const statusById = new Map(statusResult.value.map((row) => [row.id, row.status]))
		for (const memberId of req.memberIds) {
			const status = statusById.get(memberId) ?? null
			if (status === null) {
				return err(new MemberNotFoundError(`member_id ${memberId} not found`))
			}
			if (status === "RESIGNED") {
				return err(new ResignedMemberError(`member_id ${memberId} is resigned — resigned members cannot submit renewal requests`))
			}
			if (status === "PENDING_RENEWAL") {
				return err(new PendingRenewalExistsError(`member_id ${memberId} already has a pending renewal request`))
			}
			// ACTIVE / EXPIRED proceed.
		}

		// 2. Mint the shared Renewal Group marker — only for a real group. A solo
		//    submission stamps NULL (ADR-0026: NULL = solo, no marker to mint).
		const groupId = req.memberIds.length > 1 ? this.idGenerator.generate() : null

		// 3. Assemble one aggregate per member via the MANUAL factory. It fixes
		//    the status pair (APPROVED / ACTIVE) — the route's withAuth already
		//    proved staff — and computes the new expiresAt via the shared
		//    Membership Expiry rule. ONE `now` is shared by the whole submission,
		//    so every member's clock advances off the same instant. The factory
		//    returns ok unconditionally today (no self-invariant can fail); the
		//    Result shape leaves room for a future transition-validation.
		const now = new Date()
		const aggregates: MembershipRenewal[] = []
		for (const renewalResult of req.memberIds.map((memberId) =>
			// Unwrap is safe today — createManual() never errs. Written out (not
			// ._unsafeUnwrap) so the future err branch is a one-line change here.
			MembershipRenewal.createManual({
				memberId,
				paymentSlipFilePath: req.paymentSlip,
				now,
				groupId,
			})
		)) {
			if (renewalResult.isErr()) {
				return err(renewalResult.error)
			}
			aggregates.push(renewalResult.value)
		}

		// 4. Persist atomically — the transaction is an internal detail of the
		//    repository. One call, all-or-nothing across every member (N ×
		//    [INSERT renewal + UPDATE the four member cache columns]); returns
		//    ok(per-member ids) or err(DatabaseError).
		const createResult = await this.repository.createManualRenewals(aggregates)
		if (createResult.isErr()) {
			return err(createResult.error)
		}

		return ok({ renewals: createResult.value, groupId })
	}
}
