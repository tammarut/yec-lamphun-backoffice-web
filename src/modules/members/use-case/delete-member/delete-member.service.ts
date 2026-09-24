import { err, ok, type Result } from "neverthrow"
import type { Sql } from "postgres"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, singleton } from "tsyringe"
import type { IBusinessesRepository } from "../../repository/businesses/interfaces"
import type { IMemberDocumentsRepository } from "../../repository/member-document/interfaces"
import type { IMemberRepository } from "../../interfaces"
import type { DeleteMemberError } from "./delete-member.errors"

/**
 * Use case: soft-delete a member by id (DELETE /api/v1/members/:id).
 *
 * Owns the cascade transaction (ADR-0013) and the ADR-0023 business rule:
 * the member's linked shared business is soft-deleted only when the member
 * held its last live link, decided under a `SELECT ... FOR UPDATE` row lock
 * on the businesses row INSIDE this transaction so concurrent deletes of
 * co-linked members serialize (the loser sees `deleted_at` already set and
 * skips). Per ADR-0024 the transaction lives here and each repository
 * (members / businesses / member_documents) executes its own table's step —
 * which is what makes the survive / soft-delete / idempotent behaviors
 * unit-testable at this seam.
 *
 * There is no existence check, no row-count inspection, and no 404 path: every
 * step is a `deleted_at IS NULL`-guarded no-op on an already-deleted member,
 * and an already-deleted business makes the lock return null → the cascade
 * decision is skipped. A valid id always resolves to 204.
 *
 * Mirrors {@link UpdateMemberService}'s tx style: repository steps throw
 * DatabaseError inside the transaction (auto-rollback), and this service maps
 * them to the AGENTS.md §2B single-wrapped `Promise<Result<void,
 * DeleteMemberError>>`.
 */
@singleton()
export class DeleteMemberService {
	constructor(
		@inject(DatabaseClient) private readonly dbClient: DatabaseClient,
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.BUSINESSES_REPOSITORY) private readonly businessesRepository: IBusinessesRepository,
		@inject(REGISTER_KEY.MEMBER_DOCUMENTS_REPOSITORY) private readonly documentsRepository: IMemberDocumentsRepository
	) {}

	async execute(id: number): Promise<Result<void, DeleteMemberError>> {
		try {
			await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql

				// 1. Lock the linked live business (gate for the ADR-0023 cascade).
				//    null ⇒ business already gone ⇒ re-delete: still run the member's
				//    own idempotent soft-deletes, skip the cascade decision.
				const businessId = await this.businessesRepository.findLiveBusinessIdForCascade(sql, id)

				// 2-4. The member's dependent rows, then the member row. By the count
				//      below the member row is already soft-deleted, so it can never
				//      count itself; the query additionally self-excludes by id as
				//      belt-and-braces against step reordering.
				await this.documentsRepository.softDeleteByMemberId(sql, id)
				await this.repository.softDeleteMembershipRenewals(sql, id)
				await this.repository.softDeleteMemberRow(sql, id)

				// 5-6. Last-live-link rule: soft-delete the shared business only when
				//      no OTHER live member still links to it.
				if (businessId !== null) {
					const otherLiveMembers = await this.businessesRepository.countLiveMembersByBusinessId(sql, businessId, id)
					if (otherLiveMembers === 0) {
						await this.businessesRepository.softDeleteBusinessById(sql, businessId)
					}
				}
			})

			return ok(undefined)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Member deletion transaction failed", error))
		}
	}
}
