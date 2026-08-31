import { err, ok, type Result, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { IDashboardRepository } from "../interfaces"
import type { DashboardMemberStatusCountsRow, MemberCountByYearRow } from "../use-case/get-dashboard-stat/get-dashboard-stat.types"
import { countDashboardBusinesses, getDashboardMemberCountsByYear, getDashboardMemberStatusCounts } from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the dashboard module — read-only aggregates
 * for the Dashboard Stat (ADR-0019). Reads the members-owned tables through
 * the module's own sqlc block (no TS cross-import; the mirror of the renewals
 * module's arrangement). Mirrors MembershipRenewalsRepository's shape: each
 * generated call is wrapped in {@link ResultAsync.fromPromise} and converted
 * to the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` form. The only
 * failure mode is infra — no pg-code inspection, no domain errors.
 */
@injectable()
export class DashboardRepository implements IDashboardRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async getMemberStatusCounts(): Promise<Result<DashboardMemberStatusCountsRow, DatabaseError>> {
		const result = await ResultAsync.fromPromise(getDashboardMemberStatusCounts(this.sql), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}

		const row = result.value[0]
		return ok(row ?? { totalMembers: 0, totalActiveMembers: 0, totalExpiredMembers: 0 })
	}

	async getBusinessCount(): Promise<Result<number, DatabaseError>> {
		const result = await ResultAsync.fromPromise(countDashboardBusinesses(this.sql), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}

		const row = result.value[0]
		return ok(row?.totalBusinesses ?? 0)
	}

	async getMemberCountsByYear(minYear: number): Promise<Result<readonly MemberCountByYearRow[], DatabaseError>> {
		const result = await ResultAsync.fromPromise(getDashboardMemberCountsByYear(this.sql, { minYear }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}

		return ok(result.value)
	}
}
