import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IIdGenerator } from "src/modules/shared/id-generator"
import { inject, injectable } from "tsyringe"
import { MembershipRenewal } from "../../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError, type CreateRenewalError } from "./create-renewal.errors"
import type { CreateRenewalRequest, CreateRenewalResult } from "./create-renewal.types"

/**
 * Use case: create the renewal(s) for ONE membership renewal submission
 * (POST /api/v1/membership/renewals) — bulk-aware at heart (ADR-0026), serving
 * 1..6 members per request. Until the fan-out UI ships (#85/#86) callers send
 * exactly one member, and the flow is behavior-identical to the old solo path.
 *
 * Owns the member-status domain rules that gate renewal creation, checked in ONE
 * batched read over the whole member_ids array, first offender in request order
 * aborting with that member named in the error message:
 *   - member not found / soft-deleted → 404
 *   - member.status = RESIGNED → 403
 *   - member.status = PENDING_RENEWAL → 409 (already has a pending renewal)
 *
 * The pre-check runs OUTSIDE the transaction, mirroring how
 * {@link CreateNewMemberService} runs its duplicate-id_card / position checks
 * before the atomic write. Once every member is eligible, the service assembles
 * one {@link MembershipRenewal} aggregate per member via the factory — the
 * aggregate owns the submission-kind → status-pair rule (ADR-0015) and stamps
 * `paymentDateAt` — and passes them to the repository, which owns the single
 * cross-table transaction (N × [INSERT renewal + UPDATE member cache columns],
 * ADR-0014/ADR-0026) and catches the pg 23505 unique_violation as a
 * race-condition net that rolls back the whole batch and maps to the same 409.
 *
 * A submission of N>1 members shares one Renewal Group marker (UUIDv7 minted
 * through the IIdGenerator seam, ADR-0026); a solo submission mints nothing and
 * stamps NULL.
 *
 * The pre-check is UNIFORM for both submission kinds; only the aggregates'
 * resolved status values differ. The member.status values ACTIVE / EXPIRED both
 * proceed to renewal creation — an EXPIRED member filing a renewal is the
 * expected path back to ACTIVE.
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<CreateRenewalResult, CreateRenewalError>>`.
 */
@injectable()
export class CreateRenewalService {
	constructor(
		@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository,
		@inject(REGISTER_KEY.UUID_ID_GENERATOR) private readonly idGenerator: IIdGenerator
	) {}

	async execute(req: CreateRenewalRequest): Promise<Result<CreateRenewalResult, CreateRenewalError>> {
		// 1. Pre-check every member's status in ONE batched read (outside the tx).
		//    The first ineligible member — in request order — aborts the whole
		//    submission, named in the error message (ADR-0026).
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

		// 3. Assemble one aggregate per member. The factory owns the
		//    submission-kind → status-pair rule (ADR-0015) and stamps
		//    paymentDateAt at server-now. It returns ok unconditionally today
		//    (no self-invariant can fail); the Result shape leaves room for the
		//    future review API's transition checks.
		const now = new Date()
		const aggregates: MembershipRenewal[] = []
		for (const renewalResult of req.memberIds.map((memberId) =>
			// Unwrap is safe today — create() never errs. Written out (not
			// ._unsafeUnwrap) so the future err branch is a one-line change here.
			MembershipRenewal.create({
				memberId,
				paymentSlipFilePath: req.paymentSlip,
				isAdmin: req.isAdmin,
				now,
				groupId,
			})
		)) {
			if (renewalResult.isErr()) {
				return err(renewalResult.error)
			}
			aggregates.push(renewalResult.value)
		}

		// 4. Persist atomically — the transaction + the 23505 race-catch are
		//    internal details of the repository. One call, all-or-nothing across
		//    every member; returns ok(per-member ids) or
		//    err(PendingRenewalExistsError | DatabaseError).
		const createResult = await this.repository.createRenewals(aggregates)
		if (createResult.isErr()) {
			return err(createResult.error)
		}

		return ok({ renewals: createResult.value, groupId })
	}
}
