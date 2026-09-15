"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { LatestRenewalResponse } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.types"

export const LATEST_RENEWAL_QUERY_KEY = ["membership-renewals", "detail"] as const

/**
 * Latest renewal detail for one member — feeds the slip viewer's presigned
 * image (`renewal.payment_slip` is a 1-hour presigned URL, so an expired
 * preview recovers by refetching, i.e. `resetQueries` on the key below).
 * Enabled only while a member is selected (the slip-viewer dialog is open);
 * the endpoint is admin-only (`withAuth`).
 */
export function useLatestRenewal(memberId: number | null) {
	return useQuery<LatestRenewalResponse, ApiError>({
		queryKey: [...LATEST_RENEWAL_QUERY_KEY, memberId],
		queryFn: async () => {
			if (memberId === null) {
				throw new ApiError("memberId is required", 0)
			}
			const result = await fetchJson<LatestRenewalResponse>(`/api/v1/membership/renewals/${String(memberId)}`)
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
		enabled: memberId !== null,
	})
}
