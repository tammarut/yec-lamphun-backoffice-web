import { sql } from "bun"
import { err, ok, type Result, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { MembershipRenewal, RenewalStatus, ReviewedRenewal } from "../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../interfaces"
import { PendingRenewalExistsError } from "../use-case/create-renewal/create-renewal.errors"
import { InvalidCursorError } from "../use-case/get-list-expired-membership/get-list-expired-membership.errors"
import type { ExpiredMembershipListPage, ExpiredMembershipListRow, ListExpiredMembershipFilter } from "../use-case/get-list-expired-membership/get-list-expired-membership.types"
import { InvalidCursorError as ListRenewalInvalidCursorError } from "../use-case/get-list-membership-renewal/get-list-membership-renewal.errors"
import type { ListMembershipRenewalFilter, MembershipRenewalListPage, MembershipRenewalListRow } from "../use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import type { RenewalStatRow } from "../use-case/get-renewal-stat/get-renewal-stat.types"
import { RenewalAlreadyReviewedError } from "../use-case/review-renewal/review-renewal.errors"
import {
	getMemberStatusForRenewal,
	getRenewalForReview,
	getRenewalStat,
	insertMembershipRenewal,
	updateMemberOnApprovedRenewal,
	updateMemberOnRejectedReview,
	updateMemberStatusOnRenewal,
	updateRenewalOnReview,
} from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the membership-renewals module.
 *
 * Owns the create-renewal cross-table transaction (ADR-0014): inside one tx it
 * INSERTs the renewal row and UPDATEs the member's Renewal Cache Columns. This
 * is the second repository (after MembersRepository) that writes another
 * module's table — justified because the member cache columns are a
 * denormalized mirror OF the renewal's own state, so the renewal aggregate's
 * repository is the natural owner of the write. Mirrors MembersRepository's
 * shape: each generated call is wrapped in {@link ResultAsync.fromPromise} and
 * converted to the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` form.
 *
 * The INSERT helper inspects the Postgres error code on failure — the first
 * pg-code inspection in this codebase — mapping 23505 (unique_violation from
 * idx_one_pending_renewal_per_member) to PendingRenewalExistsError and all
 * other failures to DatabaseError.
 */
@injectable()
export class MembershipRenewalsRepository implements IMembershipRenewalRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async getMemberStatusForRenewal(memberId: number) {
		const result = await ResultAsync.fromPromise(getMemberStatusForRenewal(this.sql, { id: String(memberId) }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		// No row → not found or soft-deleted; the service narrows null → 404.
		return ok(row ? row.status : null)
	}

	async createRenewal(renewal: MembershipRenewal) {
		// The transaction is scoped to this method: insert renewal → update member
		// cache columns. bun:sql auto-commits on success, auto-rollbacks on throw.
		// The status values are read from the aggregate's getters — they were
		// resolved by MembershipRenewal.create() from the submission kind (ADR-0015);
		// the repo does not interpret them.
		try {
			const renewalId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				const newId = await this.doInsertRenewal(sql, renewal)
				await this.doUpdateMemberStatus(sql, renewal)
				return newId
			})

			return ok(renewalId)
		} catch (error) {
			// doInsertRenewal may throw a PendingRenewalExistsError on pg code 23505;
			// propagate it as-is so the route maps to 409. Everything else (including
			// any DatabaseError thrown by the helpers) is a DatabaseError → 500.
			if (error instanceof PendingRenewalExistsError) {
				return err(error)
			}
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Create renewal transaction failed", error))
		}
	}

	async createManualRenewal(renewal: MembershipRenewal) {
		// Same transaction shape as createRenewal: insert renewal → update member.
		// The manual write ALSO sets expires_at and bumps renewal_successful_count
		// (the clock-advancing write, ADR-0016) via a dedicated member UPDATE
		// query. The status values and expiresAt are read from the aggregate's
		// getters — built by MembershipRenewal.createManual() (APPROVED/ACTIVE +
		// end-of-next-year expiry); the repo does not interpret them.
		//
		// Unlike createRenewal there is NO PendingRenewalExistsError catch here:
		// the manual INSERT is status='APPROVED', excluded from the partial unique
		// index, so it can never raise Postgres 23505.
		try {
			const renewalId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				const newId = await this.doInsertRenewal(sql, renewal)
				await this.doUpdateMemberOnApprovedRenewal(sql, renewal.memberId, renewal.expiresAt)
				return newId
			})

			return ok(renewalId)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Create manual renewal transaction failed", error))
		}
	}

	// --- Private helpers (run inside createRenewal's transaction) ----------

	/**
	 * Insert the renewal row and return the generated id. Throws
	 * {@link PendingRenewalExistsError} on Postgres unique_violation (code 23505)
	 * from idx_one_pending_renewal_per_member — the partial unique index that
	 * enforces one PENDING_REVIEW renewal per member. The index covers
	 * status='PENDING_REVIEW' ONLY, so this only fires on the public path; an
	 * admin insert ('APPROVED') is excluded and cannot 23505. Throwing inside the
	 * tx triggers bun:sql's auto-rollback. Any other failure → DatabaseError.
	 *
	 * This is the only place in the codebase that inspects a Postgres error code;
	 * the inspection is sealed inside this helper so the pg-error-detail pattern
	 * does not leak into the service layer.
	 */
	private async doInsertRenewal(sql: Sql, renewal: MembershipRenewal): Promise<number> {
		try {
			const result = await insertMembershipRenewal(sql, {
				memberId: String(renewal.memberId),
				paymentSlipFilePath: renewal.paymentSlipFilePath,
				status: renewal.status,
			})
			const row = result[0]
			if (!row) {
				throw new DatabaseError("insertMembershipRenewal returned no row")
			}
			// BIGSERIAL comes back as a string; convert at this boundary.
			return Number(row.id)
		} catch (error) {
			// bun:sql surfaces unique_violation as a PostgresError carrying `.code`.
			// postgres.js does the same (its PostgresError also has `.code`). Either
			// driver reaches this branch with code "23505"; the partial unique index
			// idx_one_pending_renewal_per_member is the only such index on this table.
			if (isUniqueViolation(error)) {
				throw new PendingRenewalExistsError(undefined, error)
			}
			if (error instanceof DatabaseError) {
				throw error
			}
			throw new DatabaseError(error instanceof Error ? error.message : "Insert membership renewal failed", error)
		}
	}

	/**
	 * Update the member's Renewal Cache Columns (status, latest_renewal_status)
	 * inside the same transaction. latest_renewal_status mirrors the renewal's own
	 * status; member status is the aggregate's memberStatusOnRenewal. Carries
	 * `deleted_at IS NULL` (encoded in the generated SQL) matching every other
	 * members write query.
	 */
	private async doUpdateMemberStatus(sql: Sql, renewal: MembershipRenewal): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateMemberStatusOnRenewal(sql, {
				id: String(renewal.memberId),
				status: renewal.memberStatusOnRenewal,
				latestRenewalStatus: renewal.status,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}

	/**
	 * The APPROVED member cache write — shared by TWO flows whose member-side
	 * effects are column-identical (ADR-0018): the manual create flow and the
	 * review flow's approve branch. (The query was renamed from
	 * UpdateMemberOnManualRenewal to UpdateMemberOnApprovedRenewal when the
	 * review flow adopted it.) Sets ALL four Renewal Cache Columns: the two the
	 * public create write touches (status, latest_renewal_status, fixed to
	 * ACTIVE / APPROVED literals by the sqlc query) PLUS the two clock columns
	 * an approval advances — `expires_at` (bound from the caller's computed
	 * value) and `renewal_successful_count` (incremented inline, never
	 * read-then-written in TS). The generated query carries `deleted_at IS
	 * NULL` like every other members write.
	 *
	 * `expiresAt` must be bound as an ISO string, NOT a Date: Bun.SQL serializes
	 * Date via `toString()` (→ "GMT+0700"), which Postgres rejects (same quirk
	 * MembersRepository.toPgDate works around). The generated arg type demands
	 * `Date | null` (current sqlc TS plugin infers TIMESTAMPTZ params as Date),
	 * so the ISO string is cast back — the exact pattern MembersRepository uses
	 * on its own Date args (members.repository.ts insert/update call sites).
	 * {@link toPgDate} throws on a missing value — the manual aggregate and the
	 * approve outcome both always set it.
	 */
	private async doUpdateMemberOnApprovedRenewal(sql: Sql, memberId: number, expiresAt: Date | undefined): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateMemberOnApprovedRenewal(sql, {
				id: String(memberId),
				expiresAt: toPgDate(expiresAt) as unknown as Date,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}

	// --- Expired Membership List read (GET /membership/renewals/expired) ----

	/**
	 * The Expired Membership List query — the module's first READ, and its first
	 * Bun-SQL-native dynamic query (ADR-0010: the WHERE shape varies at runtime,
	 * so sqlc is the wrong tool; the handle below is the native Bun `SQL`, not
	 * the postgres.js cast the sqlc call sites use).
	 *
	 * Reads ONLY the members table: the rejected-first grouping keys off the
	 * `latest_renewal_status` Renewal Cache Column. Pagination is a group-aware
	 * keyset variant of ADR-0011 — the cursor is a bare member id, so page N+1
	 * first looks up the anchor's `latest_renewal_status` to learn which
	 * ordering group it resumes from:
	 *   - group 0 (anchor REJECTED): remaining rejected rows after the anchor
	 *     id, PLUS every non-rejected row (the second group begins).
	 *   - group 1 (anchor anything else, incl. NULL): non-rejected rows after
	 *     the anchor id only.
	 *
	 * The non-rejected test is `IS DISTINCT FROM 'REJECTED'`, deliberately NOT
	 * `!= 'REJECTED'` (grilling Q2): `latest_renewal_status` is nullable, and an
	 * expired member who never filed a renewal has NULL there. Under `!=`, NULL
	 * != 'REJECTED' evaluates NULL (falsy), silently dropping those members from
	 * every cursor page even though page 1 (no predicate) includes them.
	 * `IS DISTINCT FROM` is the null-safe form and matches the ORDER BY's
	 * `CASE ... ELSE 1 END` grouping exactly.
	 *
	 * `hasMore`/`nextCursor` are computed via `LIMIT n+1` (ADR-0011) so the n+1
	 * logic lives next to the SQL. An anchor outside the expired set (deleted, or
	 * no longer expired — e.g. renewed between pages) is treated as missing →
	 * `err(InvalidCursorError)` → 400; DB failures → `err(DatabaseError)` → 500.
	 */
	async getListExpiredMembership(filter: ListExpiredMembershipFilter): Promise<Result<ExpiredMembershipListPage, DatabaseError | InvalidCursorError>> {
		const dbConnection = this.dbClient.getRwConnection()

		// 1. Anchor lookup (only when paginating past page 1): which group does
		//    the next page resume from?
		let cursorGroup: 0 | 1 | null = null
		if (filter.cursor !== null) {
			const anchorResult = await ResultAsync.fromPromise(
				dbConnection<{ latest_renewal_status: string | null }[]>`
					SELECT m.latest_renewal_status
					FROM members m
					WHERE m.id = ${filter.cursor} AND m.deleted_at IS NULL AND m.status = 'EXPIRED'
				`,
				(error) => error as Error
			)
			if (anchorResult.isErr()) {
				return err(new DatabaseError("Expired-membership anchor lookup failed", anchorResult.error))
			}
			const anchorRow = anchorResult.value[0]
			if (anchorRow === undefined) {
				// Cursor points at a member that no longer exists OR is no longer part
				// of the expired set (soft-/hard-deleted, or renewed between the
				// client's pages). Without an anchor inside the list's domain, the
				// page-N+1 predicate cannot be meaningfully built. → 400 (ADR-0011
				// semantics — the client restarts from page 1).
				return err(new InvalidCursorError())
			}
			cursorGroup = anchorRow.latest_renewal_status === "REJECTED" ? 0 : 1
		}

		// 2. Dynamic fragments. All values are bound parameters; the two cursor
		//    branches and the ORDER BY are complete static fragments (no
		//    sql.unsafe, no identifier interpolation — see ADR-0010).
		const searchFragment = filter.search !== null ? buildMemberNameOrPhoneSearchFragment(filter.search) : sql``
		const cursorFragment =
			cursorGroup === null ? sql`` : cursorGroup === 0 ? buildRejectedGroupKeysetFragment(filter.cursor ?? 0) : buildOtherGroupKeysetFragment(filter.cursor ?? 0)
		const fetchLimit = filter.limit + 1 // n+1 → has_more detection (ADR-0011).

		// 3. Main query. Fixed sort: rejected-renewal group first, then id ASC
		//    within each group (a total order — id is unique, so no NULLS
		//    handling is needed).
		const mainResult = await ResultAsync.fromPromise(
			dbConnection`
				SELECT m.id, m.profile_avatar, m.title_name_th, m.first_name_th, m.last_name_th,
				       m.nickname, m.phone_no, m.position_code, m.status,
				       m.latest_renewal_status, m.member_since
				FROM members m
				WHERE m.deleted_at IS NULL
					AND m.status = 'EXPIRED'
					${searchFragment}
					${cursorFragment}
				ORDER BY CASE WHEN m.latest_renewal_status = 'REJECTED' THEN 0 ELSE 1 END, m.id ASC
				LIMIT ${fetchLimit}
			`,
			(error) => error as Error
		)
		if (mainResult.isErr()) {
			return err(new DatabaseError("getListExpiredMembership query failed", mainResult.error))
		}

		const rawRows = mainResult.value as unknown as ReadonlyArray<Record<string, unknown>>
		const hasMore = rawRows.length > filter.limit
		const pageRows = hasMore ? rawRows.slice(0, filter.limit) : rawRows
		const lastRow = pageRows[pageRows.length - 1]
		const nextCursor = hasMore && lastRow !== undefined ? Number(lastRow["id"]) : null

		return ok({ rows: pageRows.map(rowToExpiredMembershipRow), hasMore, nextCursor })
	}

	// --- Membership Renewal List read (GET /membership/renewals) ------------

	/**
	 * The Membership Renewal List query — the module's second Bun-SQL-native
	 * dynamic read (ADR-0010). Unlike the expired read this joins
	 * membership_renewals via LEFT JOIN LATERAL to surface the member's most
	 * recent non-deleted renewal: its `id` (the response's renewal_id — the
	 * review workflow's target) and its `payment_date_at` (the sort key). The
	 * lateral orders by `created_at DESC, id DESC` — the id tiebreak the spec's
	 * pseudocode omitted — so "most recent" is deterministic even when two
	 * renewals share a created_at. `AND mr_latest.id IS NOT NULL` turns the
	 * LEFT JOIN into the list's membership rule: a member whose cache column
	 * says PENDING_REVIEW/APPROVED but whose renewals are all soft-deleted is
	 * excluded.
	 *
	 * The SET still keys off the `latest_renewal_status` Renewal Cache Column
	 * (not the renewal row's own status) — the join enriches rows, it never
	 * decides who is in the list.
	 *
	 * Pagination is ADR-0011 keyset over (payment_date_at DESC, member id DESC)
	 * via a Postgres row-value comparison. The anchor lookup is the hardened
	 * post-935aced semantics: the anchor member must still exist, not be
	 * soft-deleted, still carry the requested latest_renewal_status, AND have a
	 * non-deleted renewal (the INNER LATERAL in the anchor query enforces the
	 * last two together). An anchor that left the set — e.g. its renewal was
	 * approved between the client's pages while paginating PENDING_REVIEW — is
	 * treated as missing → `err(InvalidCursorError)` → 400; the client restarts
	 * from page 1. The spec pseudocode's weaker lookup (any renewal exists for
	 * the member_id) was deliberately NOT copied.
	 *
	 * `hasMore`/`nextCursor` are computed via `LIMIT n+1` (ADR-0011) so the n+1
	 * logic lives next to the SQL. DB failures → `err(DatabaseError)` → 500.
	 */
	async getListMembershipRenewal(filter: ListMembershipRenewalFilter): Promise<Result<MembershipRenewalListPage, DatabaseError | ListRenewalInvalidCursorError>> {
		const dbConnection = this.dbClient.getRwConnection()

		// 1. Anchor lookup (only when paginating past page 1): the anchor's
		//    latest-renewal payment_date_at — the first component of the keyset.
		let anchorPaymentDateAt: string | null = null
		if (filter.cursor !== null) {
			const anchorResult = await ResultAsync.fromPromise(
				dbConnection<{ payment_date_at: Date }[]>`
					SELECT mr.payment_date_at
					FROM members m
					JOIN LATERAL (
						SELECT payment_date_at
						FROM membership_renewals
						WHERE member_id = m.id AND deleted_at IS NULL
						ORDER BY created_at DESC, id DESC
						LIMIT 1
					) mr ON true
					WHERE m.id = ${filter.cursor}
						AND m.deleted_at IS NULL
						AND m.latest_renewal_status = ${filter.status}
				`,
				(error) => error as Error
			)
			if (anchorResult.isErr()) {
				return err(new DatabaseError("Membership-renewal-list anchor lookup failed", anchorResult.error))
			}
			const anchorRow = anchorResult.value[0]
			if (anchorRow === undefined) {
				// Cursor points at a member that no longer exists OR has left the
				// requested status's set (soft-/hard-deleted, renewed-then-approved,
				// or no live renewal). Without an anchor inside the list's domain the
				// page-N+1 predicate cannot be meaningfully built. → 400 (ADR-0011
				// semantics — the client restarts from page 1).
				return err(new ListRenewalInvalidCursorError())
			}
			// ISO string, NOT a Date: Bun.SQL serializes Date via toString()
			// (→ "GMT+0700"), which Postgres rejects — same quirk toPgDate works
			// around. The ::timestamptz cast in the keyset fragment makes the
			// row-value comparison's type inference unambiguous.
			anchorPaymentDateAt = anchorRow.payment_date_at.toISOString()
		}

		// 2. Dynamic fragments. All values are bound parameters; the keyset
		//    fragment is a complete static fragment (no sql.unsafe — ADR-0010).
		const searchFragment = filter.search !== null ? buildMemberNameOrPhoneSearchFragment(filter.search) : sql``
		const cursorFragment = anchorPaymentDateAt === null ? sql`` : buildPaymentDateKeysetFragment(anchorPaymentDateAt, filter.cursor ?? 0)
		const fetchLimit = filter.limit + 1 // n+1 → has_more detection (ADR-0011).

		// 3. Main query. Fixed sort: payment_date_at DESC, member id DESC as the
		//    tiebreak (a total order — member id is unique, and payment_date_at is
		//    NOT NULL on membership_renewals, so no NULLS handling is needed).
		const mainResult = await ResultAsync.fromPromise(
			dbConnection`
				SELECT m.id, m.profile_avatar, m.title_name_th, m.first_name_th, m.last_name_th,
				       m.nickname, m.phone_no, m.position_code,
				       m.latest_renewal_status AS status,
				       mr_latest.id AS renewal_id,
				       mr_latest.payment_date_at,
				       m.member_since
				FROM members m
				LEFT JOIN LATERAL (
					SELECT id, payment_date_at
					FROM membership_renewals
					WHERE member_id = m.id AND deleted_at IS NULL
					ORDER BY created_at DESC, id DESC
					LIMIT 1
				) mr_latest ON true
				WHERE m.deleted_at IS NULL
					AND m.latest_renewal_status = ${filter.status}
					AND mr_latest.id IS NOT NULL
					${searchFragment}
					${cursorFragment}
				ORDER BY mr_latest.payment_date_at DESC, m.id DESC
				LIMIT ${fetchLimit}
			`,
			(error) => error as Error
		)
		if (mainResult.isErr()) {
			return err(new DatabaseError("getListMembershipRenewal query failed", mainResult.error))
		}

		const rawRows = mainResult.value as unknown as ReadonlyArray<Record<string, unknown>>
		const hasMore = rawRows.length > filter.limit
		const pageRows = hasMore ? rawRows.slice(0, filter.limit) : rawRows
		const lastRow = pageRows[pageRows.length - 1]
		const nextCursor = hasMore && lastRow !== undefined ? Number(lastRow["id"]) : null

		return ok({ rows: pageRows.map(rowToMembershipRenewalListRow), hasMore, nextCursor })
	}

	// --- Renewal Stat read (GET /membership/renewals/stat) --------------------

	/**
	 * The Renewal Stat query — the module's first STATIC read, back on the
	 * sqlc channel (ADR-0010's letter: zero parameters, nothing dynamic; the
	 * two list reads above are Bun SQL native because their WHERE shape varies
	 * at runtime). One aggregated `COUNT(*) FILTER` row over non-deleted
	 * members, reading ONLY the Renewal Cache Columns — the glossary's stated
	 * purpose for those columns (no join on a member read). The `::int` casts
	 * live in the SQL so the counts arrive as JS numbers, not BIGINT strings.
	 *
	 * `total_expired_members` follows the spec's pseudocode literally —
	 * `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'` — a
	 * deliberate superset of the Expired Membership List (ADR-0017). COUNT with
	 * no GROUP BY always returns exactly one row (all zeros over an empty
	 * members table); the zeros fallback merely mirrors the members module's
	 * count pattern (`row ? row.count : 0`) so a driver anomaly degrades to
	 * zeros instead of an undefined access. DB failures →
	 * `err(DatabaseError)` → 500.
	 */
	async getRenewalStat(): Promise<Result<RenewalStatRow, DatabaseError>> {
		const result = await ResultAsync.fromPromise(getRenewalStat(this.sql), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}

		const row = result.value[0]
		return ok(row ?? { totalExpiredMembers: 0, totalPendingReviewMembers: 0, totalApprovedMembers: 0 })
	}

	// --- Review renewal (PATCH /membership/renewals/{id}/review) ------------

	/**
	 * The review flow's pre-check read (ADR-0018) — the review-flow twin of
	 * {@link getMemberStatusForRenewal}. Runs OUTSIDE the review transaction and
	 * returns exactly the {@link MembershipRenewalDbProps} three columns, which
	 * the service feeds straight into `MembershipRenewal.fromDb`. No row → the
	 * renewal does not exist or is soft-deleted; the service narrows null → 404.
	 * DB failures map to `err(DatabaseError)` → 500.
	 */
	async getRenewalForReview(renewalId: number) {
		const result = await ResultAsync.fromPromise(getRenewalForReview(this.sql, { id: String(renewalId) }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		if (row === undefined) {
			return ok(null)
		}
		// BIGSERIAL ids come back as strings; convert at this boundary. The
		// status is CHECK-constrained to the three RenewalStatus literals, so
		// the cast is honest — same stance as rowToExpiredMembershipRow.
		return ok({ id: Number(row.id), memberId: Number(row.memberId), status: row.status as RenewalStatus })
	}

	/**
	 * The review flow's cross-table transaction (ADR-0018), mirroring
	 * {@link createRenewal}'s shape: guarded renewal UPDATE first, then the
	 * member-side write, both inside one `dbClient.transaction` (auto-commit on
	 * success, auto-rollback on throw).
	 *
	 * The guard is the load-bearing part: `updateRenewalOnReview` carries
	 * `AND status = 'PENDING_REVIEW' AND deleted_at IS NULL` and RETURNs the
	 * decided row's id, so a renewal decided by a CONCURRENT review matches zero
	 * rows — the helper throws {@link RenewalAlreadyReviewedError} (→ 409) and
	 * the whole transaction rolls back. This is what makes the 409 contract
	 * true under concurrency; the service's pre-check only catches the clean
	 * case (ADR-0018's deliberate deviation from the spec's racy
	 * check-then-write SQL).
	 *
	 * The member branch reads the outcome's own values — approve reuses the
	 * manual flow's four-column approved write (shared query,
	 * UpdateMemberOnApprovedRenewal); reject writes the two-column EXPIRED one
	 * and never touches the membership clock.
	 */
	async applyReview(reviewed: ReviewedRenewal) {
		try {
			await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				await this.doUpdateRenewalOnReview(sql, reviewed)
				if (reviewed.status === "APPROVED") {
					await this.doUpdateMemberOnApprovedRenewal(sql, reviewed.memberId, reviewed.expiresAt)
				} else {
					await this.doUpdateMemberOnRejectedReview(sql, reviewed.memberId)
				}
			})

			return ok(undefined)
		} catch (error) {
			// doUpdateRenewalOnReview throws RenewalAlreadyReviewedError when the
			// guarded UPDATE matches zero rows; propagate it as-is so the route
			// maps to 409. Everything else (including DatabaseError thrown by the
			// helpers) is a DatabaseError → 500.
			if (error instanceof RenewalAlreadyReviewedError) {
				return err(error)
			}
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Apply review transaction failed", error))
		}
	}

	/**
	 * The GUARDED renewal write — runs inside applyReview's transaction. The
	 * generated UPDATE carries `AND status = 'PENDING_REVIEW' AND deleted_at IS
	 * NULL` and RETURNs the decided row's id; an empty returning set means a
	 * concurrent review won the race (or the row vanished), which is the same
	 * domain fact as the service pre-check's 409 — throw
	 * {@link RenewalAlreadyReviewedError} to trigger the tx auto-rollback. The
	 * spec's `CASE WHEN status='REJECTED'` on rejection_reason is deliberately
	 * absent here: the guard guarantees the row was PENDING_REVIEW (reason
	 * NULL), so binding the outcome's reason-or-null directly is equivalent.
	 */
	private async doUpdateRenewalOnReview(sql: Sql, reviewed: ReviewedRenewal): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateRenewalOnReview(sql, {
				status: reviewed.status,
				rejectionReason: reviewed.rejectionReason,
				id: String(reviewed.renewalId),
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		if (result.value.length === 0) {
			throw new RenewalAlreadyReviewedError()
		}
	}

	/**
	 * The REJECTED member cache write — the review flow's reject branch, inside
	 * applyReview's transaction. Two columns only (EXPIRED / REJECTED literals
	 * fixed by the sqlc query): a rejected renewal never touches the membership
	 * clock. Carries `deleted_at IS NULL` like every other members write.
	 */
	private async doUpdateMemberOnRejectedReview(sql: Sql, memberId: number): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateMemberOnRejectedReview(sql, {
				id: String(memberId),
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}

/**
 * Narrows a thrown value to a Postgres unique_violation (error code 23505).
 *
 * Both bun:sql (`SQL.PostgresError extends SQLError`) and postgres.js
 * (`PostgresError`) surface the SQLSTATE on a readonly `.code` string property.
 * We check for that property rather than `instanceof` a driver-specific class so
 * the guard works under either driver without importing a type that may not
 * exist at runtime in this build.
 */
function isUniqueViolation(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505"
}

/**
 * Convert an approval's expiresAt Date to a Postgres-safe ISO 8601 string.
 *
 * Same Bun.SQL quirk MembersRepository.toPgDate works around: Date.toString()
 * yields a local-tz string ("GMT+0700") that Postgres rejects; toISOString()
 * ("Z" suffix) is accepted for TIMESTAMPTZ. Callers: the manual-create
 * aggregate and the review-approve outcome — both always set expiresAt, so a
 * missing value is a programmer error — throw rather than silently write NULL.
 */
function toPgDate(date: Date | undefined): string {
	if (date === undefined) {
		throw new DatabaseError("Manual renewal aggregate is missing expiresAt")
	}
	return date.toISOString()
}

// --- Expired Membership List helpers (module-level, like MembersRepository's
// --- rowToMemberListRow — stateless pure functions over one row/fragment) ---

/**
 * Contains-ILIKE (`%q%`) across first_name_th and phone_no (spec: search by
 * first name or phone; grilling confirmed following the spec here — both list
 * endpoints deviate from GET /members' prefix-anchored pattern intentionally).
 * Shared by the Expired Membership List and the Membership Renewal List, whose
 * search semantics are identical. LIKE wildcards in the user input (`%`, `_`)
 * and the escape char (`\`) itself are escaped so a search for a literal `%` or
 * `_` matches itself; `ESCAPE '\'` declares the escape char to Postgres. The
 * pattern stays a bound parameter — this is semantic escaping, not
 * SQL-injection protection.
 */
function buildMemberNameOrPhoneSearchFragment(search: string) {
	const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
	const pattern = `%${escaped}%`
	return sql`AND (m.first_name_th ILIKE ${pattern} ESCAPE '\\'
	               OR m.phone_no ILIKE ${pattern} ESCAPE '\\')`
}

/**
 * Keyset fragment when the anchor row was in the REJECTED group (group 0):
 * keep the remaining rejected rows after the anchor id, OR move on to the
 * entire non-rejected group. `IS DISTINCT FROM` is the null-safe inequality —
 * see getListExpiredMembership for why `!=` would silently drop members who
 * never filed a renewal.
 */
function buildRejectedGroupKeysetFragment(cursorId: number) {
	return sql`AND (
		(m.latest_renewal_status = 'REJECTED' AND m.id > ${cursorId})
		OR (m.latest_renewal_status IS DISTINCT FROM 'REJECTED')
	)`
}

/**
 * Keyset fragment when the anchor row was in the non-rejected group (group 1):
 * only non-rejected rows after the anchor id remain (the rejected group was
 * fully emitted on earlier pages).
 */
function buildOtherGroupKeysetFragment(cursorId: number) {
	return sql`AND m.latest_renewal_status IS DISTINCT FROM 'REJECTED' AND m.id > ${cursorId}`
}

/**
 * Keyset fragment for the Membership Renewal List's sort
 * (payment_date_at DESC, member id DESC): a Postgres row-value comparison,
 * which expands to `payment_date_at < anchor OR (payment_date_at = anchor AND
 * id < cursorId)` — exactly the continuation of a DESC, DESC keyset. The anchor
 * payment_date_at arrives as an ISO string (Bun.SQL Date quirk — see
 * getListMembershipRenewal) and is cast to timestamptz so the comparison's type
 * inference is unambiguous.
 */
function buildPaymentDateKeysetFragment(anchorPaymentDateAt: string, cursorId: number) {
	return sql`AND (mr_latest.payment_date_at, m.id) < (${anchorPaymentDateAt}::timestamptz, ${cursorId})`
}

/** Map one raw snake_case row to the camelCase {@link ExpiredMembershipListRow}. */
function rowToExpiredMembershipRow(row: Record<string, unknown>): ExpiredMembershipListRow {
	return {
		id: Number(row["id"]),
		profileAvatar: (row["profile_avatar"] as string | null) ?? null,
		titleNameTh: row["title_name_th"] as string,
		firstNameTh: row["first_name_th"] as string,
		lastNameTh: row["last_name_th"] as string,
		nickname: row["nickname"] as string,
		phoneNo: row["phone_no"] as string,
		positionCode: row["position_code"] as string,
		// The query filters status = 'EXPIRED', so the cast is honest: no other
		// value is reachable.
		status: row["status"] as "EXPIRED",
		// CHECK-constrained to the three RenewalStatus literals; nullable when
		// the member never filed a renewal.
		latestRenewalStatus: (row["latest_renewal_status"] as RenewalStatus | null) ?? null,
		memberSince: row["member_since"] as Date,
	}
}

/** Map one raw snake_case row to the camelCase {@link MembershipRenewalListRow}. */
function rowToMembershipRenewalListRow(row: Record<string, unknown>): MembershipRenewalListRow {
	return {
		id: Number(row["id"]),
		renewalId: Number(row["renewal_id"]),
		profileAvatar: (row["profile_avatar"] as string | null) ?? null,
		titleNameTh: row["title_name_th"] as string,
		firstNameTh: row["first_name_th"] as string,
		lastNameTh: row["last_name_th"] as string,
		nickname: row["nickname"] as string,
		phoneNo: row["phone_no"] as string,
		positionCode: row["position_code"] as string,
		// The query filters latest_renewal_status = filter.status (already
		// narrowed to PENDING_REVIEW | APPROVED by the schema), so the cast is
		// honest: no other value is reachable.
		status: row["status"] as MembershipRenewalListRow["status"],
		memberSince: row["member_since"] as Date,
		paymentDateAt: row["payment_date_at"] as Date,
	}
}
