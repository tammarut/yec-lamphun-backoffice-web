import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member } from "./domain/member"
import type { MemberDetailReadModel, MemberLatestRenewalReadModel, MemberDocumentType, PositionReadModel } from "./domain/member-read-models"
import type { InvalidCursorError } from "./use-case/get-list-members/get-list-members.errors"
import type { ListMembersFilter, MemberListPage } from "./use-case/get-list-members/get-list-members.types"
import type { ExecutiveCommitteeMemberRow } from "./use-case/get-executive-committee/get-executive-committee.types"

export interface IMemberRepository {
	// --- Check queries (run OUTSIDE the create-member transaction) ----------

	/** Count non-deleted members matching the id_card blind index. >0 = duplicate. */
	countMemberByIdCardHash(idCardNoHash: string): Promise<Result<number, DatabaseError>>

	/** Fetch a position by code, including cardinality (for the conflict policy). */
	getPositionByCode(code: string): Promise<Result<PositionReadModel | null, DatabaseError>>

	/** Count non-deleted members currently holding a position. */
	countActiveHolderByPosition(positionCode: string): Promise<Result<number, DatabaseError>>

	// --- Writes -------------------------------------------------------------

	/**
	 * Persist a new member atomically: inserts the member row, its documents,
	 * and its business record inside a single database transaction. Returns the
	 * generated member id. The transaction + multi-table insert is an internal
	 * implementation detail — callers see one method.
	 */
	create(member: Member): Promise<Result<number, DatabaseError>>

	/**
	 * Update an existing member atomically inside a single transaction:
	 *   1. UPDATE members SET ... (mutable columns only; lifecycle columns
	 *      preserved — see ADR-0012 / grilling Q4)
	 *   2. UPDATE member_business SET ... (location must arrive already swapped
	 *      to [long, lat] by the MemberBusiness VO)
	 *   3. For each type in {@link documentTypesToReplace}: soft-delete the
	 *      member's existing live rows of that type, then insert the new row(s)
	 *      from `updated.documents` of that type (grilling Q6).
	 *
	 * The caller (update use case) computes {@link documentTypesToReplace} by
	 * diffing the resolved request against the stored values — the repository
	 * just executes the policy it's given. The set is a subset of
	 * `{'ID_CARD', 'COMPANY_CERTIFICATE'}` and may be empty (no document
	 * replacement this edit).
	 *
	 * `id` is the path-param member id; the UPDATE's `WHERE deleted_at IS NULL`
	 * makes a soft-delete that races the read indistinguishable from not-found
	 * (the row count is ignored — this endpoint accepts last-writer-wins per
	 * grilling Q11).
	 */
	update(id: number, updated: Member, documentTypesToReplace: readonly MemberDocumentType[]): Promise<Result<void, DatabaseError>>

	/**
	 * Soft-delete a member and its dependent rows atomically in one transaction,
	 * in spec order: member_documents → member_business → membership_renewals →
	 * members (ADR-0013). Idempotent — every UPDATE carries `deleted_at IS NULL`,
	 * so an already-deleted member is a 0-row no-op (grilling Q2: the route
	 * returns 204 regardless, never 404). No existence pre-check, no row-count
	 * inspection; the membership_renewals soft-delete is generated in this
	 * module's sqlc block (its schema is a parse-time DDL reference only).
	 */
	softDeleteMember(id: number): Promise<Result<void, DatabaseError>>

	// --- Reads --------------------------------------------------------------

	/**
	 * Fetch a non-deleted member's detail (member + 1:1 business + latest-wins
	 * ID_CARD/COMPANY_CERTIFICATE documents) by id.
	 *
	 * Returns `null` when the member does not exist or is soft-deleted (the route
	 * maps both to 404, indistinguishable). Returns `err(DatabaseError)` when a
	 * live member has no live business row — that case is impossible via the
	 * create flow (business insert is unconditional + atomic), so it signals
	 * out-of-band corruption and the route maps it to 500 (grilling Q6/iii-a).
	 */
	getMemberDetailById(id: number): Promise<Result<MemberDetailReadModel | null, DatabaseError>>

	/**
	 * Fetch a non-deleted member's identity + business name + its single newest
	 * non-deleted renewal (id DESC, LIMIT 1) for the backoffice "latest renewal"
	 * single-view (GET /api/v1/membership/renewals/:member_id). One composite row
	 * via a LEFT JOIN LATERAL — the first read of membership_renewals from this
	 * repository (ADR-0013 was a write); a natural extension of that ownership.
	 *
	 * Returns `null` when the member (or its 1:1 business) does not exist /
	 * is soft-deleted — the service maps that to 404 "Member or renewal not
	 * found". A non-null row whose `renewalId` is `null` means the member exists
	 * but has no renewal — the service maps that to the distinct 404 "No renewal
	 * records found". Never returns `err` for a not-found case (only for a DB
	 * failure → 500).
	 */
	getLatestRenewalByMemberId(id: number): Promise<Result<MemberLatestRenewalReadModel | null, DatabaseError>>

	/**
	 * Paginated, filtered, sorted list of members for the backoffice table
	 * (infinite scroll). Returns one page of rows + `has_more` + `next_cursor`
	 * (computed via the `LIMIT n+1` trick, ADR-0011). Keyset pagination on
	 * `(sort_field, id)`; the cursor's anchor-row sort value is fetched in a
	 * separate cheap lookup, and a missing anchor returns
	 * `err(InvalidCursorError)` → 400 (grilling Q3b / ADR-0011).
	 *
	 * Uses Bun SQL native — this is a dynamic read whose `WHERE`/`ORDER BY`
	 * shape varies at runtime; see ADR-0010 for the sqlc-vs-Bun-SQL split.
	 *
	 * Corrupted members (live member with no live business row) are silently
	 * excluded via an INNER JOIN — the list's job is to render the page, not
	 * to assert the 1:1 invariant per-row; that loudness lives in
	 * `getMemberDetailById` (grilling Q9).
	 */
	getListMembers(filter: ListMembersFilter): Promise<Result<MemberListPage, DatabaseError | InvalidCursorError>>

	// --- Executive committee reads (GET /api/v1/members/executive-committee) --

	/**
	 * Fetch every position row ordered by `(display_order, code)`. The
	 * executive-committee service consumes the whole hierarchy (Thai names +
	 * parent links) to assemble the org-chart tree and to materialize Vacant
	 * Position placeholders for missing rungs (ADR-0020). Includes inactive
	 * positions — placement on the chart keys off holders, not is_active.
	 */
	getAllPositions(): Promise<Result<readonly PositionReadModel[], DatabaseError>>

	/**
	 * Fetch the flat Executive Committee rows: every non-deleted, non-RESIGNED
	 * member holding any position except GENERAL_MEMBER, with the member's 1:1
	 * business name (null when no live business row). Ordered by
	 * `(positions.display_order, members.id)` so the service's tree assembly
	 * yields org-chart sibling order without re-sorting. The service — not this
	 * query — derives parent-child links from the position hierarchy
	 * (members has no parent_id column; ADR-0020).
	 */
	getExecutiveCommittee(): Promise<Result<readonly ExecutiveCommitteeMemberRow[], DatabaseError>>
}
