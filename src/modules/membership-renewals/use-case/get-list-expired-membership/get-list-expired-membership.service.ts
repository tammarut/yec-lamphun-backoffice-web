import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IStorageUrlResolver } from "src/modules/shared/storage/storage-url-resolver.interface"
import { inject, singleton } from "tsyringe"
import type { IMembershipRenewalRepository } from "../../interfaces"
import type { GetListExpiredMembershipError } from "./get-list-expired-membership.errors"
import type { ExpiredMembershipListRow, ExpiredMembershipResponse, ListExpiredMembershipFilter, ListExpiredMembershipPageResponse } from "./get-list-expired-membership.types"

/**
 * Use case (query): the Expired Membership List for the backoffice renewal-
 * review table (infinite scroll).
 *
 * A read-only orchestrator over two collaborators:
 *   1. {@link IMembershipRenewalRepository.getListExpiredMembership} — the
 *      dynamic Bun-SQL group-aware keyset query (ADR-0010/0011). Owns
 *      `has_more`/`next_cursor` computation.
 *   2. The shared {@link IStorageUrlResolver} — resolves each row's stored
 *      `profile_avatar` key to a public URL (ADR-0007). `publicUrl` is a pure
 *      sync concat, so the null-check + call is all this service needs; the
 *      members module's MemberFileUrlService is NOT imported (module boundary —
 *      grilling Q5 placed this use case in the renewals module).
 *
 * The service itself is pure mapping: repo row → response DTO, with the URL
 * resolution as the only side-effectful step. `has_more` / `next_cursor` are
 * threaded through unchanged from the repo (which computed them next to the
 * `LIMIT n+1` SQL).
 *
 * Returns AGENTS.md §2B `Promise<Result<ListExpiredMembershipPageResponse, GetListExpiredMembershipError>>`.
 * `InvalidCursorError` (deleted anchor) and `DatabaseError` (infra) propagate
 * unchanged; the route maps them to 400 and 500 respectively.
 */
@singleton()
export class GetListExpiredMembershipService {
	constructor(
		@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository,
		@inject(REGISTER_KEY.STORAGE_URL_RESOLVER) private readonly urlResolver: IStorageUrlResolver
	) {}

	async execute(filter: ListExpiredMembershipFilter): Promise<Result<ListExpiredMembershipPageResponse, GetListExpiredMembershipError>> {
		const pageResult = await this.repository.getListExpiredMembership(filter)
		if (pageResult.isErr()) {
			return err(pageResult.error)
		}

		const { rows, hasMore, nextCursor } = pageResult.value
		const data: ReadonlyArray<ExpiredMembershipResponse> = rows.map((row) => this.toResponse(row))

		const next_cursor = nextCursor === null ? null : String(nextCursor)
		const response: ListExpiredMembershipPageResponse = {
			data: data,
			has_more: hasMore,
			next_cursor: next_cursor,
		}
		return ok(response)
	}

	/** Map one repo row to its wire DTO, resolving the avatar URL on the way. */
	private toResponse(row: ExpiredMembershipListRow): ExpiredMembershipResponse {
		return {
			id: row.id,
			profile_avatar: row.profileAvatar === null ? null : this.urlResolver.publicUrl(row.profileAvatar),
			title_name_th: row.titleNameTh,
			first_name_th: row.firstNameTh,
			last_name_th: row.lastNameTh,
			nickname: row.nickname,
			phone_no: row.phoneNo,
			// Q4: ship the position CODE verbatim; the frontend maps to a display
			// name. Consistent with GET /members.
			position: row.positionCode,
			status: row.status,
			// Renewal Status of the member's most recent renewal (null = never
			// filed) — powers the UI's rejected-renewal badge.
			latest_renewal_status: row.latestRenewalStatus,
			member_since: row.memberSince.toISOString(),
		}
	}
}
