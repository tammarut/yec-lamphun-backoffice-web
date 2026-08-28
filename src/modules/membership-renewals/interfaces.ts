import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { MembershipRenewal } from "./domain/membership-renewal"
import type { PendingRenewalExistsError } from "./use-case/create-renewal/create-renewal.errors"
import type { InvalidCursorError } from "./use-case/get-list-expired-membership/get-list-expired-membership.errors"
import type { ExpiredMembershipListPage, ListExpiredMembershipFilter } from "./use-case/get-list-expired-membership/get-list-expired-membership.types"
import type { InvalidCursorError as ListRenewalInvalidCursorError } from "./use-case/get-list-membership-renewal/get-list-membership-renewal.errors"
import type { ListMembershipRenewalFilter, MembershipRenewalListPage } from "./use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import type { RenewalStatRow } from "./use-case/get-renewal-stat/get-renewal-stat.types"

/**
 * Repository contract for the membership-renewals module.
 *
 * The create-renewal flow is split across two methods mirroring the create-member
 * convention (grilling Q2): a cheap READ for the service-side status pre-check
 * (outside the transaction), and a WRITE that owns the cross-table transaction
 * (ADR-0014). The service orchestrates the 404/403/409 domain decisions and
 * assembles the {@link MembershipRenewal} aggregate; the repository owns
 * atomicity and the Postgres 23505 catch, reading the status pair from the
 * aggregate's getters.
 *
 * The MANUAL create-renewal flow (ADR-0016) reuses the same READ for its
 * pre-check and adds its own WRITE — {@link createManualRenewal} — because the
 * manual write advances the membership clock (`expires_at` +
 * `renewal_successful_count`) on top of the shared status/`latest_renewal_status`
 * cache-column write.
 */
export interface IMembershipRenewalRepository {
	/**
	 * Pre-check read (runs OUTSIDE the create-renewal transaction): fetch the
	 * member's current status for the service's 404/403/409 early-exit branches.
	 *
	 * Shared by the public and manual flows. Returns `null` when the member does
	 * not exist or is soft-deleted (the two are indistinguishable to the client
	 * → 404). Returns the status string otherwise (e.g. "ACTIVE", "RESIGNED",
	 * "PENDING_RENEWAL").
	 */
	getMemberStatusForRenewal(memberId: number): Promise<Result<string | null, DatabaseError>>

	/**
	 * Atomically create a renewal and update the member's Renewal Cache Columns
	 * in one transaction (ADR-0014). Status values are read from the aggregate's
	 * getters (resolved by the service from the submission kind, ADR-0015):
	 *   1. INSERT INTO membership_renewals (member_id, payment_slip_file_path,
	 *      payment_date_at, renewal.status) RETURNING id
	 *   2. UPDATE members SET status=renewal.memberStatusOnRenewal,
	 *      latest_renewal_status=renewal.status WHERE id AND deleted_at IS NULL
	 *
	 * The partial unique index idx_one_pending_renewal_per_member covers
	 * status='PENDING_REVIEW' ONLY, so a public insert may hit Postgres code
	 * 23505 under a race that beats the pre-check; this method catches that code
	 * and returns `err(PendingRenewalExistsError)` (→ 409). An admin insert
	 * ('APPROVED') is excluded from the index and cannot 23505. All other DB
	 * failures map to `err(DatabaseError)`. On success returns `ok(newRenewalId)`.
	 */
	createRenewal(renewal: MembershipRenewal): Promise<Result<number, PendingRenewalExistsError | DatabaseError>>

	/**
	 * Atomically create a MANUAL renewal and advance the member's membership
	 * clock in one transaction (ADR-0016). Reads status values AND the computed
	 * expiresAt from the aggregate (built by the service via
	 * `MembershipRenewal.createManual`, which fixes APPROVED/ACTIVE and computes
	 * the end-of-next-year expiry):
	 *   1. INSERT INTO membership_renewals (member_id, payment_slip_file_path,
	 *      payment_date_at, status='APPROVED') RETURNING id
	 *   2. UPDATE members SET status='ACTIVE', latest_renewal_status='APPROVED',
	 *      expires_at=renewal.expiresAt,
	 *      renewal_successful_count=renewal_successful_count+1
	 *      WHERE id AND deleted_at IS NULL
	 *
	 * Distinct from {@link createRenewal} because the manual flow writes FOUR
	 * member cache columns (the public flow writes two and deliberately leaves
	 * expires_at / renewal_successful_count untouched — ADR-0015 deferred them;
	 * ADR-0016 assigns them here).
	 *
	 * The INSERT here is always status='APPROVED', which is EXCLUDED from the
	 * partial unique index idx_one_pending_renewal_per_member, so this method
	 * can NEVER raise Postgres 23505 — its error type is just `DatabaseError`.
	 * (The only PendingRenewalExistsError on the manual path comes from the
	 * service pre-check, `member.status === PENDING_RENEWAL`, never from here.)
	 * On success returns `ok(newRenewalId)`.
	 */
	createManualRenewal(renewal: MembershipRenewal): Promise<Result<number, DatabaseError>>

	/**
	 * The Expired Membership List read for GET /api/v1/membership/renewals/expired
	 * (the renewals module's first READ). A members-table-only dynamic query
	 * (Bun SQL native, ADR-0010): the rejected-first grouping keys off the
	 * `latest_renewal_status` Renewal Cache Column, so membership_renewals is
	 * never touched.
	 *
	 * Pagination is a group-aware keyset variant of ADR-0011: the cursor is a
	 * bare member id; the page-N+1 predicate needs the anchor's
	 * latest_renewal_status to know which ordering group to resume. An anchor
	 * that no longer exists OR is no longer part of the expired set (deleted or
	 * renewed between pages) → `err(InvalidCursorError)` → 400.
	 * `hasMore`/`nextCursor` are computed via `LIMIT n+1` next to the SQL.
	 */
	getListExpiredMembership(filter: ListExpiredMembershipFilter): Promise<Result<ExpiredMembershipListPage, DatabaseError | InvalidCursorError>>

	/**
	 * The Membership Renewal List read for GET /api/v1/membership/renewals —
	 * members whose most recent renewal holds the requested Renewal Status
	 * (PENDING_REVIEW or APPROVED), ordered by that renewal's payment_date_at
	 * DESC then member id DESC. Unlike the expired read this is a LATERAL join
	 * into membership_renewals (the renewal id and payment date are part of the
	 * payload and the sort), but the SET membership still keys off the
	 * `latest_renewal_status` Renewal Cache Column.
	 *
	 * Pagination is ADR-0011 keyset over (payment_date_at, member id). The
	 * anchor lookup is the hardened post-935aced semantics: the anchor member
	 * must still exist AND still carry the requested latest_renewal_status AND
	 * have a non-deleted renewal — otherwise `err(InvalidCursorError)` → 400
	 * (the client restarts from page 1). `hasMore`/`nextCursor` are computed
	 * via `LIMIT n+1` next to the SQL.
	 */
	getListMembershipRenewal(filter: ListMembershipRenewalFilter): Promise<Result<MembershipRenewalListPage, DatabaseError | ListRenewalInvalidCursorError>>

	/**
	 * The Renewal Stat read for GET /api/v1/membership/renewals/stat — the
	 * three badge counts above the renewal-review table, from ONE aggregated
	 * `COUNT(*) FILTER` query. The module's first STATIC read: zero parameters,
	 * nothing dynamic, so sqlc owns it (ADR-0010's letter — the two list reads
	 * are dynamic, hence Bun SQL native). Reads ONLY the members table via the
	 * Renewal Cache Columns; membership_renewals is never joined.
	 *
	 * `total_expired_members` follows the spec's pseudocode literally —
	 * `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'` — a deliberate
	 * superset of the Expired Membership List (ADR-0017). The three counts are
	 * not a partition; a member may appear in more than one.
	 *
	 * COUNT with no GROUP BY always returns one row (all zeros over an empty
	 * table); the repo still guards with a zeros fallback like the members
	 * module's count pattern. DB failures map to `err(DatabaseError)`.
	 */
	getRenewalStat(): Promise<Result<RenewalStatRow, DatabaseError>>
}
