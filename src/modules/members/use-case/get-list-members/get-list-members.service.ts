import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import type { GetListMembersError } from "./get-list-members.errors"
import type { ListMembersFilter, ListMembersPageResponse, MemberListItemResponse, MemberListRow } from "./get-list-members.types"

/**
 * Use case (query): list members for the backoffice table (infinite scroll).
 *
 * A read-only orchestrator over two collaborators:
 *   1. {@link IMemberRepository.getListMembers} — the dynamic Bun-SQL keyset
 *      query (ADR-0010/0011). Owns `has_more`/`next_cursor` computation.
 *   2. {@link MemberFileUrlService.resolveProfileAvatarUrl} — resolves each
 *      row's stored `profile_avatar` key to a public URL (ADR-0007, grilling Q6).
 *      Sync and infallible per row; no presigning, no private fields.
 *
 * The service itself is pure mapping: repo row → response DTO, with the URL
 * resolution as the only side-effectful step. `has_more` / `next_cursor` are
 * threaded through unchanged from the repo (which computed them next to the
 * `LIMIT n+1` SQL).
 *
 * Returns AGENTS.md §2B `Promise<Result<ListMembersPageResponse, GetListMembersError>>`.
 * `InvalidCursorError` (deleted anchor) and `DatabaseError` (infra) propagate
 * unchanged; the route maps them to 400 and 500 respectively.
 */
@singleton()
export class GetListMembersService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.MEMBER_FILE_URL_SERVICE) private readonly urlService: MemberFileUrlService
	) {}

	async execute(filter: ListMembersFilter): Promise<Result<ListMembersPageResponse, GetListMembersError>> {
		const pageResult = await this.repository.getListMembers(filter)
		if (pageResult.isErr()) {
			return err(pageResult.error)
		}

		const { rows, hasMore, nextCursor } = pageResult.value
		const data: ReadonlyArray<MemberListItemResponse> = rows.map((row) => this.toResponse(row))

		const next_cursor = nextCursor === null ? null : String(nextCursor)
		const response: ListMembersPageResponse = {
			data: data,
			has_more: hasMore,
			next_cursor: next_cursor,
		}
		return ok(response)
	}

	/** Map one repo row to its wire DTO, resolving the avatar URL on the way. */
	private toResponse(row: MemberListRow): MemberListItemResponse {
		return {
			id: row.id,
			profile_avatar: this.urlService.resolveProfileAvatarUrl(row.profileAvatar),
			registration_type: row.registrationType,
			title_name_th: row.titleNameTh,
			first_name_th: row.firstNameTh,
			last_name_th: row.lastNameTh,
			nickname: row.nickname,
			phone_no: row.phoneNo,
			email: row.email,
			line_id: row.lineId,
			// Q4: ship the position CODE verbatim; the frontend maps to a Thai
			// display name. Consistent with GetMemberByIdService.toResponse.
			position: row.positionCode,
			status: row.status,
			business: { name: row.businessName, description: row.businessDescription },
		}
	}
}
