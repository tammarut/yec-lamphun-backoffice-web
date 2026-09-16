"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { RenewalStatResponse } from "src/modules/membership-renewals/use-case/get-renewal-stat/get-renewal-stat.types"

export const RENEWAL_STAT_QUERY_KEY = ["membership-renewals", "stat"] as const

/**
 * The three Renewal Stat badge counts (GET /api/v1/membership/renewals/stat,
 * public). `total_expired_members` is the ADR-0017 superset (Member Status
 * EXPIRED or latest renewal REJECTED) — the authoritative ยังไม่ได้ต่ออายุ
 * number the PR 2 worklist deliberately does not badge. The counts are NOT a
 * partition; display them as-is.
 */
export function useRenewalStat() {
	return useQuery<RenewalStatResponse, ApiError>({
		queryKey: RENEWAL_STAT_QUERY_KEY,
		// The counts only change on renewal writes (PR 3), which invalidate this
		// key explicitly — skip the refetch every observer remount would trigger
		// at staleTime 0 (mirrors the settings/session probes).
		staleTime: 30_000,
		queryFn: async () => {
			const result = await fetchJson<RenewalStatResponse>("/api/v1/membership/renewals/stat")
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
	})
}
