import type { Sql } from "postgres"
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

	/** Which contact columns (phone/email/line) another LIVE member already holds (partial unique indexes). */
	findLiveContactConflicts(
		phoneNo: string,
		email: string | null,
		lineId: string | null,
		excludeMemberId: number | null
	): Promise<Result<{ phoneNo: boolean; email: boolean; lineId: boolean }, DatabaseError>>

	/** Fetch a position by code, including cardinality (for the conflict policy). */
	getPositionByCode(code: string): Promise<Result<PositionReadModel | null, DatabaseError>>

	/** Count non-deleted members currently holding a position. */
	countActiveHolderByPosition(positionCode: string): Promise<Result<number, DatabaseError>>

	// --- Writes -------------------------------------------------------------

	/**
	 * Persist a new member atomically: inserts the shared business row
	 * (ADR-0023), then the member row linking it via business_id, then its
	 * documents — all inside a single database transaction. Returns the
	 * generated member id. The transaction + multi-table insert is an internal
	 * implementation detail — callers see one method.
	 */
	create(member: Member): Promise<Result<number, DatabaseError>>

	/**
	 * Update an existing member atomically inside a single transaction:
	 *   1. UPDATE members SET ... (mutable columns only; lifecycle columns
	 *      preserved — see ADR-0012 / grilling Q4)
	 *   2. UPDATE businesses SET ... — wholesale overwrite of the SHARED row
	 *      the member links to (ADR-0023): every linked member sees the edit.
	 *      location must arrive already swapped to [long, lat] by the
	 *      MemberBusiness VO
	 *   3. For each type in {@link documentTypesToReplace}: soft-delete the
	 *      member's existing live rows of that type, then insert the new row(s)
	 *      from `updated.documents` of that type (grilling Q6).
	 *
	 * `businessId` is the shared businesses.id resolved from the read model by
	 * the update use case (a live member always has a live business — the
	 * corruption guard in getMemberDetailById runs upstream).
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
	update(id: number, updated: Member, businessId: number, documentTypesToReplace: readonly MemberDocumentType[]): Promise<Result<void, DatabaseError>>

	// --- Delete-flow transaction steps (DELETE /api/v1/members/:id) ----------

	/**
	 * The ADR-0013 cascade steps, now tx-scoped: {@link DeleteMemberService}
	 * owns the single DatabaseClient.transaction and the ADR-0023 cascade
	 * decision, so the survive / soft-delete / idempotent behaviors are unit-
	 * testable at the service seam (ADR-0023). Each method THROWS
	 * DatabaseError on failure — throwing inside the transaction aborts and
	 * rolls it back (same style as the create/update internals); the service
	 * maps that to `err()`. `tx` is the transaction handle.
	 */

	/**
	 * Lock (SELECT ... FOR UPDATE) the member's linked LIVE business row and
	 * return its id — the ADR-0023 cascade gate. Returns `null` when the
	 * business is already soft-deleted/absent: a re-delete then skips the
	 * cascade entirely (idempotent 204, never 404). The lock is held until the
	 * transaction ends and serializes concurrent deletes of co-linked members.
	 */
	findLiveBusinessIdForCascade(tx: Sql, memberId: number): Promise<number | null>

	/** Soft-delete all of the member's live document rows. */
	softDeleteMemberDocuments(tx: Sql, memberId: number): Promise<void>

	/**
	 * Soft-delete the member's live membership-renewal rows. Generated in this
	 * module's sqlc block (its schema is a parse-time DDL reference only) —
	 * members still owns the renewals cascade (ADR-0013).
	 */
	softDeleteMembershipRenewals(tx: Sql, memberId: number): Promise<void>

	/** Soft-delete the member row itself. */
	softDeleteMemberRow(tx: Sql, memberId: number): Promise<void>

	/**
	 * Count OTHER live members still linked to the business. `excludeMemberId`
	 * is the deleting member — still live at count time (the lock precedes the
	 * soft-deletes), so it must be excluded. 0 ⇒ the caller fires
	 * {@link softDeleteBusinessById} (ADR-0023 last-live-link rule).
	 */
	countLiveMembersByBusinessId(tx: Sql, businessId: number, excludeMemberId: number): Promise<number>

	/** Soft-delete the shared business row (ADR-0023: businesses do not survive their last live member). */
	softDeleteBusinessById(tx: Sql, businessId: number): Promise<void>

	// --- Reads --------------------------------------------------------------

	/**
	 * Fetch a non-deleted member's detail (member + linked shared business +
	 * latest-wins ID_CARD/COMPANY_CERTIFICATE documents) by id.
	 *
	 * Returns `null` when the member does not exist or is soft-deleted (the route
	 * maps both to 404, indistinguishable). Returns `err(DatabaseError)` when a
	 * live member has no live business row — impossible via the create flow
	 * (business insert is unconditional + atomic) and by the ADR-0023 invariant
	 * (live member ⇒ live business), so it signals out-of-band corruption and
	 * the route maps it to 500 (grilling Q6/iii-a).
	 */
	getMemberDetailById(id: number): Promise<Result<MemberDetailReadModel | null, DatabaseError>>

	/**
	 * Fetch a non-deleted member's identity + shared business name + its single
	 * newest non-deleted renewal (id DESC, LIMIT 1) for the backoffice "latest
	 * renewal" single-view (GET /api/v1/membership/renewals/:member_id). One
	 * composite row via a LEFT JOIN LATERAL — the first read of
	 * membership_renewals from this repository (ADR-0013 was a write); a
	 * natural extension of that ownership.
	 *
	 * Returns `null` when the member (or its linked business) does not exist /
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
	 * to assert the invariant per-row; that loudness lives in
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
	 * member holding any position except GENERAL_MEMBER, with the member's
	 * shared business name (null when no live business row). Ordered by
	 * `(positions.display_order, members.id)` so the service's tree assembly
	 * yields org-chart sibling order without re-sorting. The service — not this
	 * query — derives parent-child links from the position hierarchy
	 * (members has no parent_id column; ADR-0020).
	 */
	getExecutiveCommittee(): Promise<Result<readonly ExecutiveCommitteeMemberRow[], DatabaseError>>
}
