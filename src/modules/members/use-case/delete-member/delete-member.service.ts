import { type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import type { IMemberRepository } from "../../interfaces"
import type { DeleteMemberError } from "./delete-member.errors"

/**
 * Use case: soft-delete a member by id (DELETE /api/v1/members/:id).
 *
 * Paper-thin — the cascade transaction (member_documents → member_business →
 * membership_renewals → members) and its idempotency guarantee are owned by the
 * repository (ADR-0013, grilling Q2/Q3). This service exists only as the DI/test
 * seam and to return the AGENTS.md §2B single-wrapped
 * `Promise<Result<void, DeleteMemberError>>`. There is no existence check, no
 * row-count inspection, and no 404 path: a valid id always resolves to 204.
 *
 * Mirrors {@link UpdateMemberService} but without its crypto/conflict/sticky-file
 * concerns — DELETE is the simplest member command.
 */
@singleton()
export class DeleteMemberService {
	constructor(@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository) {}

	async execute(id: number): Promise<Result<void, DeleteMemberError>> {
		return await this.repository.softDeleteMember(id)
	}
}
