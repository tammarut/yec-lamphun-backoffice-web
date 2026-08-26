import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IStorageUrlResolver } from "src/modules/shared/storage/storage-url-resolver.interface"
import { inject, singleton } from "tsyringe"
import type { IMembershipRenewalRepository } from "../../interfaces"
import type { GetListMembershipRenewalError } from "./get-list-membership-renewal.errors"
import type { ListMembershipRenewalFilter, ListMembershipRenewalPageResponse, MembershipRenewalListRow, MembershipRenewalResponse } from "./get-list-membership-renewal.types"

/**
 * Use case (query): the Membership Renewal List for the backoffice renewal-
 * review table (infinite scroll), filtered to one Renewal Status tab
 * (PENDING_REVIEW or APPROVED).
 *
 * A read-only orchestrator over two collaborators — the same pair as the
 * Expired Membership List:
 *   1. {@link IMembershipRenewalRepository.getListMembershipRenewal} — the
 *      dynamic Bun-SQL LATERAL-join keyset query (ADR-0010/0011). Owns
 *      `has_more`/`next_cursor` computation and the hardened anchor check.
 *   2. The shared {@link IStorageUrlResolver} — resolves each row's stored
 *      `profile_avatar` key to a public URL (ADR-0007). `publicUrl` is a pure
 *      sync concat, so the null-check + call is all this service needs; the
 *      members module's MemberFileUrlService is NOT imported (module boundary).
 *
 * The service itself is pure mapping: repo row → response DTO, with the URL
 * resolution as the only side-effectful step. `has_more` / `next_cursor` are
 * threaded through unchanged from the repo (which computed them next to the
 * `LIMIT n+1` SQL).
 *
 * Returns AGENTS.md §2B `Promise<Result<ListMembershipRenewalPageResponse, GetListMembershipRenewalError>>`.
 * `InvalidCursorError` (stale anchor) and `DatabaseError` (infra) propagate
 * unchanged; the route maps them to 400 and 500 respectively.
 */
@singleton()
export class GetListMembershipRenewalService {
	constructor(
		@inject(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY) private readonly repository: IMembershipRenewalRepository,
		@inject(REGISTER_KEY.STORAGE_URL_RESOLVER) private readonly urlResolver: IStorageUrlResolver
	) {}

	async execute(filter: ListMembershipRenewalFilter): Promise<Result<ListMembershipRenewalPageResponse, GetListMembershipRenewalError>> {
		const pageResult = await this.repository.getListMembershipRenewal(filter)
		if (pageResult.isErr()) {
			return err(pageResult.error)
		}

		const { rows, hasMore, nextCursor } = pageResult.value
		const data: ReadonlyArray<MembershipRenewalResponse> = rows.map((row) => this.toResponse(row))

		const next_cursor = nextCursor === null ? null : String(nextCursor)
		const response: ListMembershipRenewalPageResponse = {
			data: data,
			has_more: hasMore,
			next_cursor: next_cursor,
		}
		return ok(response)
	}

	/** Map one repo row to its wire DTO, resolving the avatar URL on the way. */
	private toResponse(row: MembershipRenewalListRow): MembershipRenewalResponse {
		return {
			id: row.id,
			// Included despite the formal schema omitting it (grilling Q2) — the
			// pending-review tab acts on the renewal, and needs its id to do so.
			renewal_id: row.renewalId,
			profile_avatar: row.profileAvatar === null ? null : this.urlResolver.publicUrl(row.profileAvatar),
			title_name_th: row.titleNameTh,
			first_name_th: row.firstNameTh,
			last_name_th: row.lastNameTh,
			nickname: row.nickname,
			phone_no: row.phoneNo,
			// Raw position CODE; the frontend maps to a display name (grilling Q3 —
			// consistent with the expired list and GET /members; the spec's
			// POSITION_MAP Thai rendering was rejected).
			position: row.positionCode,
			status: row.status,
			member_since: row.memberSince.toISOString(),
			payment_date_at: row.paymentDateAt.toISOString(),
		}
	}
}
