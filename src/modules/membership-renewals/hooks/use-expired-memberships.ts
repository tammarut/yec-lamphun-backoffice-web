"use client"

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { ListExpiredMembershipPageResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"

/** Page size for the expired-membership worklist — API allows 1..100, default 10. */
export const EXPIRED_MEMBERSHIPS_PAGE_LIMIT = 20

export const EXPIRED_MEMBERSHIPS_QUERY_KEY = ["membership-renewals", "expired-list"] as const

/** Full query key incl. the search term — invalidation matches on the prefix above. */
type ExpiredMembershipsKey = readonly ["membership-renewals", "expired-list", string]

async function fetchExpiredMembershipsPage(search: string, cursor: string | null): Promise<ListExpiredMembershipPageResponse> {
	const params = new URLSearchParams({ limit: String(EXPIRED_MEMBERSHIPS_PAGE_LIMIT) })
	// The API trims and treats empty as "no filter"; omit the param entirely
	// for an empty term to keep the URL clean.
	if (search !== "") {
		params.set("search", search)
	}
	if (cursor !== null) {
		params.set("cursor", cursor)
	}
	const result = await fetchJson<ListExpiredMembershipPageResponse>(`/api/v1/membership/renewals/expired?${params.toString()}`)
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Cursor-accumulating expired-membership list (ADR-0011 keyset pagination,
 * rejected-renewal group first). The query key carries the search term, so
 * changing it (e.g. the debounced search input) resets the accumulated pages.
 * `has_more: false` ends the chain via an `undefined` next cursor.
 */
export function useExpiredMemberships(search: string) {
	return useInfiniteQuery<ListExpiredMembershipPageResponse, ApiError, InfiniteData<ListExpiredMembershipPageResponse>, ExpiredMembershipsKey, string | null>({
		queryKey: [...EXPIRED_MEMBERSHIPS_QUERY_KEY, search],
		queryFn: ({ pageParam }) => fetchExpiredMembershipsPage(search, pageParam),
		initialPageParam: null,
		getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
	})
}
