"use client"

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type {
	ListableRenewalStatus,
	ListMembershipRenewalPageResponse,
} from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"

/** Page size for the รอตรวจสอบ/ปกติ table — API allows 1..100, default 10. */
export const MEMBERSHIP_RENEWALS_PAGE_LIMIT = 20

export const MEMBERSHIP_RENEWALS_LIST_QUERY_KEY = ["membership-renewals", "list"] as const

/** Full query key incl. status + search term — invalidation matches on the prefix above. */
type MembershipRenewalsKey = readonly ["membership-renewals", "list", ListableRenewalStatus, string]

async function fetchMembershipRenewalsPage(status: ListableRenewalStatus, search: string, cursor: string | null): Promise<ListMembershipRenewalPageResponse> {
	const params = new URLSearchParams({ limit: String(MEMBERSHIP_RENEWALS_PAGE_LIMIT), status })
	// The API trims and treats empty as "no filter"; omit the param entirely
	// for an empty term to keep the URL clean.
	if (search !== "") {
		params.set("search", search)
	}
	if (cursor !== null) {
		params.set("cursor", cursor)
	}
	const result = await fetchJson<ListMembershipRenewalPageResponse>(`/api/v1/membership/renewals?${params.toString()}`)
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Cursor-accumulating renewal list for the รอตรวจสอบ/ปกติ table (ADR-0011
 * keyset over payment_date_at DESC, id DESC). The query key carries the status
 * filter and the search term, so switching tabs or typing (the debounced search
 * input) resets the accumulated pages. `has_more: false` ends the chain via an
 * `undefined` next cursor.
 */
export function useMembershipRenewals(status: ListableRenewalStatus, search: string) {
	return useInfiniteQuery<ListMembershipRenewalPageResponse, ApiError, InfiniteData<ListMembershipRenewalPageResponse>, MembershipRenewalsKey, string | null>({
		queryKey: [...MEMBERSHIP_RENEWALS_LIST_QUERY_KEY, status, search],
		queryFn: ({ pageParam }) => fetchMembershipRenewalsPage(status, search, pageParam),
		initialPageParam: null,
		getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
	})
}
