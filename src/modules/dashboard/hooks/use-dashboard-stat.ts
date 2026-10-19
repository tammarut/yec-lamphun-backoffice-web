"use client"
import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { DashboardStatResponse } from "src/modules/dashboard/use-case/get-dashboard-stat/get-dashboard-stat.types"

export const DASHBOARD_STAT_QUERY_KEY = ["dashboard", "stat"] as const

/**
 * The Dashboard Stat — the five headline counts feeding every card on
 * /dashboard (GET /api/v1/dashboard/stat, public). One fetch feeds the KPI
 * row and the per-year chart. The only failure mode is infra (500
 * `{ error_message: "Internal Server Error" }`), surfaced as ApiError.
 */
export function useDashboardStat() {
	return useQuery<DashboardStatResponse, ApiError>({
		queryKey: DASHBOARD_STAT_QUERY_KEY,
		staleTime: 30_000,
		queryFn: async () => {
			const result = await fetchJson<DashboardStatResponse>("/api/v1/dashboard/stat")
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
	})
}
