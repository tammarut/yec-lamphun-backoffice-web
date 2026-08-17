import { sql } from "bun"
import { err, ok, type Result, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { MembershipRenewal, RenewalStatus } from "../domain/membership-renewal"
import type { IMembershipRenewalRepository } from "../interfaces"
import { PendingRenewalExistsError } from "../use-case/create-renewal/create-renewal.errors"
import { InvalidCursorError } from "../use-case/get-list-expired-membership/get-list-expired-membership.errors"
import type { ExpiredMembershipListPage, ExpiredMembershipListRow, ListExpiredMembershipFilter } from "../use-case/get-list-expired-membership/get-list-expired-membership.types"
import { getMemberStatusForRenewal, insertMembershipRenewal, updateMemberOnManualRenewal, updateMemberStatusOnRenewal } from "./sql/sqlc-generated/queries_sql"

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
				await this.doUpdateMemberOnManualRenewal(sql, renewal)
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
	 * The MANUAL member cache write — runs inside createManualRenewal's
	 * transaction. Sets ALL four Renewal Cache Columns for the manual flow
	 * (ADR-0016): the two the public write touches (status, latest_renewal_status,
	 * here fixed to ACTIVE / APPROVED literals by the sqlc query) PLUS the two
	 * clock columns the manual flow advances — `expires_at` (bound from the
	 * aggregate's computed value) and `renewal_successful_count` (incremented
	 * inline). The generated query carries `deleted_at IS NULL` like every other
	 * members write.
	 *
	 * `expiresAt` must be bound as an ISO string, NOT a Date: Bun.SQL serializes
	 * Date via `toString()` (→ "GMT+0700"), which Postgres rejects (same quirk
	 * MembersRepository.toPgDate works around). The conversion is isolated here.
	 */
	private async doUpdateMemberOnManualRenewal(sql: Sql, renewal: MembershipRenewal): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateMemberOnManualRenewal(sql, {
				id: String(renewal.memberId),
				expiresAt: toPgDate(renewal.expiresAt),
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
	 * logic lives next to the SQL. A missing anchor (deleted between pages) →
	 * `err(InvalidCursorError)` → 400; DB failures → `err(DatabaseError)` → 500.
	 */
	async getListExpiredMembership(filter: ListExpiredMembershipFilter): Promise<Result<ExpiredMembershipListPage, DatabaseError | InvalidCursorError>> {
		const db = this.dbClient.getRwConnection()

		// 1. Anchor lookup (only when paginating past page 1): which group does
		//    the next page resume from?
		let cursorGroup: 0 | 1 | null = null
		if (filter.cursor !== null) {
			const anchorResult = await ResultAsync.fromPromise(
				db<{ latest_renewal_status: string | null }[]>`
					SELECT m.latest_renewal_status
					FROM members m
					WHERE m.id = ${filter.cursor} AND m.deleted_at IS NULL
				`,
				(error) => error as Error
			)
			if (anchorResult.isErr()) {
				return err(new DatabaseError("Expired-membership anchor lookup failed", anchorResult.error))
			}
			const anchorRow = anchorResult.value[0]
			if (anchorRow === undefined) {
				// Cursor points at a member that no longer exists (soft- or hard-deleted
				// since the client's previous page). Without the anchor's group, the
				// page-N+1 predicate cannot be built. → 400 (ADR-0011 semantics).
				return err(new InvalidCursorError())
			}
			cursorGroup = anchorRow.latest_renewal_status === "REJECTED" ? 0 : 1
		}

		// 2. Dynamic fragments. All values are bound parameters; the two cursor
		//    branches and the ORDER BY are complete static fragments (no
		//    sql.unsafe, no identifier interpolation — see ADR-0010).
		const searchFragment = filter.search !== null ? buildExpiredSearchFragment(filter.search) : sql``
		const cursorFragment =
			cursorGroup === null ? sql`` : cursorGroup === 0 ? buildRejectedGroupKeysetFragment(filter.cursor ?? 0) : buildOtherGroupKeysetFragment(filter.cursor ?? 0)
		const fetchLimit = filter.limit + 1 // n+1 → has_more detection (ADR-0011).

		// 3. Main query. Fixed sort: rejected-renewal group first, then id ASC
		//    within each group (a total order — id is unique, so no NULLS
		//    handling is needed).
		const mainResult = await ResultAsync.fromPromise(
			db`
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
 * Convert the manual renewal's expiresAt Date to a Postgres-safe ISO 8601 string.
 *
 * Same Bun.SQL quirk MembersRepository.toPgDate works around: Date.toString()
 * yields a local-tz string ("GMT+0700") that Postgres rejects; toISOString()
 * ("Z" suffix) is accepted for TIMESTAMPTZ. The manual aggregate always sets
 * expiresAt (createManual), so a missing value is a programmer error — throw
 * rather than silently write NULL.
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
 * first name or phone; grilling confirmed following the spec here — this list
 * deviates from GET /members' prefix-anchored pattern intentionally). LIKE
 * wildcards in the user input (`%`, `_`) and the escape char (`\`) itself are
 * escaped so a search for a literal `%` or `_` matches itself; `ESCAPE '\'`
 * declares the escape char to Postgres. The pattern stays a bound parameter —
 * this is semantic escaping, not SQL-injection protection.
 */
function buildExpiredSearchFragment(search: string) {
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
