import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { DashboardMemberStatusCountsRow, MemberCountByYearRow } from "./use-case/get-dashboard-stat/get-dashboard-stat.types"

/**
 * Repository contract for the dashboard module.
 *
 * The module's single use case (the Dashboard Stat) is assembled from three
 * independent aggregate reads over the members-owned tables (`members`,
 * `member_business` — owned by the members module per ADR-0005). This module
 * reads them through its own sqlc block (schemas referenced for FK parsing
 * only, no TS cross-import — the symmetric mirror of the renewals block,
 * ADR-0013 pattern; ADR-0019). All three queries are STATIC text, so sqlc owns
 * them per ADR-0010's letter — including the yearly breakdown, whose one
 * runtime parameter (`minYear`) is a bound int, not a composed fragment.
 *
 * Only failure mode is infra: every method maps DB failures to
 * `err(DatabaseError)` (AGENTS.md §2B `Promise<Result<T, DatabaseError>>`).
 */
export interface IDashboardRepository {
	/**
	 * The three member-status headline counts from ONE aggregated
	 * `COUNT(*) FILTER` query: total non-deleted members, ACTIVE members, and
	 * the spec-literal "not yet renewed" count
	 * (`status IN ('EXPIRED', 'PENDING_RENEWAL')` — deliberately different
	 * from the Renewal Stat's same-named field; see the use-case types).
	 * RESIGNED members land in `totalMembers` but neither status bucket.
	 *
	 * COUNT with no GROUP BY always returns one row (all zeros over an empty
	 * table); the repo still guards with a zeros fallback like the members
	 * module's count pattern.
	 */
	getMemberStatusCounts(): Promise<Result<DashboardMemberStatusCountsRow, DatabaseError>>

	/**
	 * The count of non-deleted Member Businesses (at most one per member,
	 * ADR-0005) — the `total_businesses` headline count. Same single-row
	 * zeros-fallback guard as {@link getMemberStatusCounts}.
	 */
	getBusinessCount(): Promise<Result<number, DatabaseError>>

	/**
	 * The `total_members_each_year` source rows: non-deleted members grouped
	 * by Bangkok wall-clock year of `member_since` (see the sqlc query —
	 * `AT TIME ZONE 'Asia/Bangkok'` pins year boundaries regardless of the DB
	 * session timezone), ascending, restricted to `year >= minYear`. The
	 * service passes `minYear = currentBangkokYear - lookbackYears + 1` and
	 * zero-fills the rest of the window.
	 */
	getMemberCountsByYear(minYear: number): Promise<Result<readonly MemberCountByYearRow[], DatabaseError>>
}
