"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
// Deliberate cross-module TYPE-ONLY import (same precedent as use-latest-renewal):
// the wire shape is owned by the members module, whose list endpoint this searches.
import type { ListMembersPageResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

export const RENEWAL_MEMBER_SEARCH_QUERY_KEY = ["membership-renewals", "member-search"] as const

/** Candidate cap for the renewal form's ① autocomplete (mockup dropdown size). */
const MEMBER_SEARCH_LIMIT = 8

/** Resigned members cannot renew (POST /renewals refuses them with 403), so the autocomplete never offers them. */
const RENEWABLE_MEMBER_STATUSES = "ACTIVE,EXPIRED,PENDING_RENEWAL"

async function searchRenewableMembers(search: string): Promise<ListMembersPageResponse> {
	const params = new URLSearchParams({ limit: String(MEMBER_SEARCH_LIMIT), status: RENEWABLE_MEMBER_STATUSES })
	if (search !== "") {
		params.set("search", search)
	}
	const result = await fetchJson<ListMembersPageResponse>(`/api/v1/members?${params.toString()}`)
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * First page of the member autocomplete for the renewal form's ① section —
 * one fetch per debounced term, no cursor paging (the mockup shows a short
 * candidate list). The server is the filter (prefix on first name / phone /
 * position), so the combobox renders these rows verbatim.
 */
export function useRenewalMemberSearch(search: string) {
	return useQuery<ListMembersPageResponse, ApiError>({
		queryKey: [...RENEWAL_MEMBER_SEARCH_QUERY_KEY, search],
		queryFn: () => searchRenewableMembers(search),
		enabled: search !== "",
		// Same 30s freshness window as the PR 2b settings/stat hooks — the search
		// is inside a dialog, so focus jitters shouldn't refetch mid-pick.
		staleTime: 30_000,
	})
}
