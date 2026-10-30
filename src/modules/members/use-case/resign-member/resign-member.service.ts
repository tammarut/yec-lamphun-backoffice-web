import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, injectable } from "tsyringe"

import type { IMemberResignRepository } from "../../interfaces"
import { MemberNotFoundError, MemberNotExpiredError, type ResignMemberError } from "./resign-member.errors"

/**
 * Use case (command): the Resign Expired Member — #113
 * (POST /api/v1/members/:id/resign). The admin-initiated close-out of the
 * expired-members worklist: flips a member's Member Status from EXPIRED to
 * RESIGNED and stamps `updated_at` — the FIRST write path to RESIGNED, which
 * previously existed only in the DB CHECK constraint, the TS unions and the
 * ลาออก label. Zero schema migration.
 *
 * EXPIRED is the only transitionable source status, enforced TWICE (the
 * manual-renewal pre-check + guarded-write precedent):
 *   1. The service pre-checks via {@link IMemberResignRepository.getMemberStatusById}:
 *      0 rows → {@link MemberNotFoundError} (404; missing and soft-deleted are
 *      indistinguishable), any non-EXPIRED status → {@link MemberNotExpiredError}
 *      (409).
 *   2. The write itself is guarded — `WHERE status = 'EXPIRED' AND
 *      deleted_at IS NULL` — so a status change between the read and the
 *      write (the race) matches 0 rows and maps to the SAME 409.
 *
 * `status` is the ONLY Renewal Cache Column touched: latest_renewal_status,
 * expires_at and renewal_successful_count stay untouched (history intact);
 * RESIGNED is terminal — there is deliberately no un-resign path.
 *
 * Returns AGENTS.md §2B `Promise<Result<void, ResignMemberError>>` — the
 * route translates the outcome to 204 / 404 / 409 / 500.
 */
@injectable()
export class ResignMemberService {
	constructor(@inject(REGISTER_KEY.MEMBER_RESIGN_REPOSITORY) private readonly repository: IMemberResignRepository) {}

	async execute(memberId: number): Promise<Result<void, ResignMemberError>> {
		// 1. Pre-check read (outside any transaction — two single atomic
		//    statements; the guard on the write is what keeps them race-safe,
		//    not a wrapping tx).
		const statusResult = await this.repository.getMemberStatusById(memberId)
		if (statusResult.isErr()) {
			return err(statusResult.error)
		}
		if (statusResult.value === null) {
			return err(new MemberNotFoundError())
		}
		if (statusResult.value !== "EXPIRED") {
			return err(new MemberNotExpiredError())
		}

		// 2. The guarded write: 0 rows means the member's status changed under
		//    us between the pre-check and this UPDATE — the lost race maps to
		//    the same 409 as any other non-EXPIRED status.
		const resignResult = await this.repository.resignMemberById(memberId)
		if (resignResult.isErr()) {
			return err(resignResult.error)
		}
		if (!resignResult.value) {
			return err(new MemberNotExpiredError())
		}

		return ok(undefined)
	}
}
