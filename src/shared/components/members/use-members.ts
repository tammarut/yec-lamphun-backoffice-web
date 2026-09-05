"use client"

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { ListMembersPage } from "src/shared/components/members/members-types"

/** Page size for the directory list — API allows 1..50, default 10. */
export const MEMBERS_PAGE_LIMIT = 20

export const MEMBERS_LIST_QUERY_KEY = ["members", "list"] as const

/** Full query key incl. the search term — invalidation matches on the prefix above. */
type MembersListKey = readonly ["members", "list", string]

async function fetchMembersPage(search: string, cursor: string | null): Promise<ListMembersPage> {
	const params = new URLSearchParams({ limit: String(MEMBERS_PAGE_LIMIT) })
	// The API trims and treats empty as "no filter"; omit the param entirely
	// for an empty term to keep the URL clean.
	if (search !== "") {
		params.set("search", search)
	}
	if (cursor !== null) {
		params.set("cursor", cursor)
	}
	const result = await fetchJson<ListMembersPage>(`/api/v1/members?${params.toString()}`)
	if (result.isErr()) throw result.error
	return result.value
}

/**
 * Cursor-accumulating members list (ADR-0011 keyset pagination). The query key
 * carries the search term, so changing it (e.g. the debounced search input)
 * resets the accumulated pages. `has_more: false` ends the chain via an
 * `undefined` next cursor.
 */
export function useMembers(search: string) {
	return useInfiniteQuery<ListMembersPage, ApiError, InfiniteData<ListMembersPage>, MembersListKey, string | null>({
		queryKey: [...MEMBERS_LIST_QUERY_KEY, search],
		queryFn: ({ pageParam }) => fetchMembersPage(search, pageParam),
		initialPageParam: null,
		getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
	})
}

async function deleteMember(id: number): Promise<void> {
	const result = await fetchJson<null>(`/api/v1/members/${id}`, { method: "DELETE" })
	if (result.isErr()) throw result.error
}

/** Soft-delete (ADR-0013) + list invalidation; toasts are owned by the caller. */
export function useDeleteMember() {
	const queryClient = useQueryClient()
	return useMutation<void, ApiError, number>({
		mutationFn: deleteMember,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: MEMBERS_LIST_QUERY_KEY })
		},
	})
}
