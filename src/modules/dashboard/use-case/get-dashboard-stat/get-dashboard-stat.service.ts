import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import type { IDashboardRepository } from "../../interfaces"
import type { DashboardStatResponse } from "./get-dashboard-stat.types"

/**
 * Use case (query): the Dashboard Stat — the five headline counts of the
 * backoffice dashboard, served by GET /api/v1/dashboard/stat.
 *
 * A read-only orchestrator over a single collaborator,
 * {@link IDashboardRepository}: three static sqlc aggregates over the
 * members-owned tables (ADR-0010's letter, ADR-0019). The service adds the
 * two pieces SQL cannot own:
 *   1. The year policy — `currentYear` is the Bangkok wall-clock year and
 *      `minYear = currentYear - lookbackYears + 1` is passed to the repo as
 *      the yearly query's bound int param. Keeping the policy HERE (not in
 *      `CURRENT_DATE` arithmetic) means grouping and zero-fill share one
 *      timezone decision, independent of DB/app server clocks.
 *   2. The zero-fill — every year in [minYear, currentYear] appears as a key
 *      (0 when no member joined that year); repo rows outside the window are
 *      defensively ignored (never expected — the query already filters).
 *
 * No domain errors to surface — the only failure mode is infra
 * (`DatabaseError`), which propagates unchanged for the route to map to 500.
 *
 * Returns AGENTS.md §2B
 * `Promise<Result<DashboardStatResponse, DatabaseError>>`.
 */
@singleton()
export class GetDashboardStatService {
	constructor(@inject(REGISTER_KEY.DASHBOARD_REPOSITORY) private readonly repository: IDashboardRepository) {}

	async execute(lookbackYears: number): Promise<Result<DashboardStatResponse, DatabaseError>> {
		const currentYear = currentYearInBangkok()
		const minYear = currentYear - lookbackYears + 1

		const memberStatusCounts = await this.repository.getMemberStatusCounts()
		if (memberStatusCounts.isErr()) {
			return err(memberStatusCounts.error)
		}

		const businessCount = await this.repository.getBusinessCount()
		if (businessCount.isErr()) {
			return err(businessCount.error)
		}

		const memberCountsByYear = await this.repository.getMemberCountsByYear(minYear)
		if (memberCountsByYear.isErr()) {
			return err(memberCountsByYear.error)
		}

		return ok({
			total_members: memberStatusCounts.value.totalMembers,
			total_active_members: memberStatusCounts.value.totalActiveMembers,
			total_expired_members: memberStatusCounts.value.totalExpiredMembers,
			total_businesses: businessCount.value,
			total_members_each_year: this.toYearlyCounts(memberCountsByYear.value, minYear, currentYear),
		})
	}

	/**
	 * Zero-fill the [minYear, currentYear] window, then overwrite with the
	 * repo's actual counts. Rows outside the window are ignored — defensive
	 * only (the SQL already filters `year >= minYear`, and no row can exceed
	 * the current Bangkok year).
	 */
	private toYearlyCounts(rows: readonly { readonly year: number; readonly count: number }[], minYear: number, currentYear: number): Readonly<Record<string, number>> {
		const yearlyCounts: Record<string, number> = {}
		for (let year = minYear; year <= currentYear; year++) {
			yearlyCounts[String(year)] = 0
		}
		for (const row of rows) {
			if (row.year >= minYear && row.year <= currentYear) {
				yearlyCounts[String(row.year)] = row.count
			}
		}
		return yearlyCounts
	}
}

/**
 * The current calendar year in Thai wall-clock time — the same Asia/Bangkok
 * policy the yearly SQL query pins with `AT TIME ZONE 'Asia/Bangkok'`
 * (ADR-0019). locale-independent via `formatToParts` (no YYYY-string guessing
 * from a locale's formatted output).
 */
function currentYearInBangkok(): number {
	const yearPart = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }).formatToParts(new Date()).find((part) => part.type === "year")
	return Number(yearPart?.value ?? Number.NaN)
}
