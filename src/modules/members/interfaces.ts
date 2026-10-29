import type { Sql } from "postgres"
import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member, MemberStatus } from "./domain/member"
import type { MemberDetailReadModel, MemberLatestRenewalReadModel, PositionReadModel } from "./domain/member-read-models"
import type { InvalidCursorError } from "./use-case/get-list-members/get-list-members.errors"
import type { ListMembersFilter, MemberListPage } from "./use-case/get-list-members/get-list-members.types"
import type { ExecutiveCommitteeMemberRow } from "./use-case/get-executive-committee/get-executive-committee.types"

/**
 * Repository contract for the `members` (and `positions`) tables: member-row
 * persistence plus the member-centric reads (ADR-0024). The shared `businesses`
 * write side + delete-cascade boundary lives in IBusinessesRepository and the
 * `member_documents` mutations in IMemberDocumentsRepository — the SERVICES own
 * the multi-table transactions and call these repositories per table
 * (ADR-0023/0024). The one deliberate cross-table leftover is the
 * membership_renewals soft-delete below (ADR-0013).
 *
 * Transaction-scoped step methods take the service's `tx` handle and THROW
 * DatabaseError on failure so the service's `DatabaseClient.transaction`
 * auto-rollbacks; the service maps that to `err()`.
 */
export interface IMemberRepository {
	// --- Check queries (run OUTSIDE any transaction) -------------------------

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

	// --- Tx-scoped member-row steps ------------------------------------------

	/**
	 * Insert the member row (with its business link) and return the generated id
	 * as a number (BIGSERIAL → number). Runs INSIDE the create transaction,
	 * AFTER BusinessesRepository.insertBusiness — `businessId` is that step's
	 * returned id, consumed by the NOT NULL members.business_id column.
	 */
	insertMember(tx: Sql, member: Member, businessId: number): Promise<number>

	/**
	 * Update a non-deleted member's mutable columns. Lifecycle columns (status,
	 * member_since, expires_at, renewal_successful_count) are omitted by the
	 * UPDATE statement itself — they can never be clobbered (grilling Q4).
	 * Runs INSIDE the update transaction, before the business overwrite.
	 */
	updateMember(tx: Sql, id: number, member: Member): Promise<void>

	/**
	 * Re-point a non-deleted member at a different live business — the #69
	 * re-link step. The ONLY query allowed to mutate members.business_id.
	 * Runs INSIDE the update transaction AFTER
	 * {@link IBusinessesRepository.lockLiveBusinessIdByMemberId} has locked the
	 * member's current (old) business row; the caller releases the old business
	 * when it held the last live link (ADR-0023 lifecycle participation).
	 */
	updateMemberBusinessLink(tx: Sql, memberId: number, businessId: number): Promise<void>

	/**
	 * Soft-delete the member row itself — delete-cascade step. Idempotent
	 * (`deleted_at IS NULL` guard): an already-deleted member is a 0-row no-op
	 * (grilling Q2: the route returns 204 regardless, never 404).
	 */
	softDeleteMemberRow(tx: Sql, memberId: number): Promise<void>

	/**
	 * Soft-delete the member's live membership-renewal rows — delete-cascade
	 * step. Generated in this module's sqlc block (its schema is a parse-time
	 * DDL reference only): members still owns the renewals cascade (ADR-0013),
	 * the one deliberate cross-table leftover after the ADR-0024 split.
	 */
	softDeleteMembershipRenewals(tx: Sql, memberId: number): Promise<void>

	// --- Reads (member-centric projections; JOINed business columns stay here
	//     per ADR-0024 — one round-trip per read) ------------------------------

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

/**
 * Repository port for the Annual Membership Expiry (ADR-0027) — the yearly
 * scheduled job that moves live ACTIVE members whose Membership Expiry
 * precedes the Renewal Season boundary (or NULL) to EXPIRED. Segregated from
 * {@link IMemberRepository} on purpose: these two queries exist only for the
 * cron use case and are unlikely to be reused (repo-review ruling, PR #109).
 * Both run OUTSIDE any transaction (single atomic statements).
 *
 * Implemented by MembersRepository (same class — the write target is the
 * members table, ADR-0024), registered under its own DI token.
 */
export interface IAnnualMembershipExpiryRepository {
	/**
	 * Count live ACTIVE members the job would expire at `boundary` —
	 * Membership Expiry before it. A NULL `expires_at` is deliberately never
	 * matched (repo-review ruling, PR #109). The exact predicate of
	 * {@link IAnnualMembershipExpiryRepository.expireMembersDueForAnnualExpiry},
	 * read-only: the job's `--dry-run` count (no mutation).
	 */
	countMembersDueForAnnualExpiry(boundary: Date): Promise<Result<number, DatabaseError>>

	/**
	 * The job's write: flip every live ACTIVE member whose Membership Expiry
	 * is before `boundary` to EXPIRED, stamping `updated_at`. A NULL
	 * `expires_at` is deliberately never matched (repo-review ruling, PR #109).
	 * `status` is the only Renewal Cache Column touched (ADR-0027 §5). Single
	 * atomic statement — no transaction wrapper — and expiry-keyed, hence
	 * idempotent. Returns the number of expired members (RETURNING rows; the
	 * sqlc TS plugin emits no rows-affected executor).
	 */
	expireMembersDueForAnnualExpiry(boundary: Date): Promise<Result<number, DatabaseError>>
}

/**
 * Repository port for the Resign Expired Member command (#113) —
 * `POST /api/v1/members/:id/resign`, the admin-initiated close-out of the
 * expired-members worklist and the FIRST write path to Member Status
 * RESIGNED (it existed only in the CHECK constraint, TS unions and labels
 * before). Segregated from {@link IMemberRepository} for the same reason as
 * {@link IAnnualMembershipExpiryRepository}: a lifecycle transition outside
 * the renewal flows, with its own two queries. Both run OUTSIDE any
 * transaction (two single atomic statements — pre-check read, then the
 * guarded write).
 *
 * Implemented by MembersRepository (same class — the write target is the
 * members table, ADR-0024), registered under its own DI token. The service
 * owns the transition rule: read → 404/409 pre-check, then the guarded
 * UPDATE whose own `status = 'EXPIRED'` WHERE rejects the lost race the same
 * way.
 */
export interface IMemberResignRepository {
	/**
	 * Read a live member's current Member Status — the resign flow's
	 * pre-check. Returns `null` when the member does not exist or is
	 * soft-deleted (the service maps both to 404, indistinguishable — the
	 * getMemberDetailById rule).
	 */
	getMemberStatusById(id: number): Promise<Result<MemberStatus | null, DatabaseError>>

	/**
	 * The resign write: flip the member to RESIGNED, stamping `updated_at`.
	 * `status` is the ONLY Renewal Cache Column touched — latest_renewal_status,
	 * expires_at and renewal_successful_count stay untouched (history intact).
	 * The UPDATE's own guard (`deleted_at IS NULL AND status = 'EXPIRED'`)
	 * re-checks the transition on the row: a member whose status changed
	 * between the pre-check and this write (the race) matches 0 rows.
	 * Returns `true` when the row was flipped, `false` on the 0-row race —
	 * the service maps `false` to 409 like any other non-EXPIRED status
	 * (RETURNING rows; the sqlc TS plugin emits no rows-affected executor).
	 */
	resignMemberById(id: number): Promise<Result<boolean, DatabaseError>>
}
