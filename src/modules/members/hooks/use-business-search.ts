"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { BusinessPickerItem } from "src/modules/members/schemas/member-wizard-schema"

export const BUSINESS_SEARCH_QUERY_KEY = ["business", "search"] as const

/** Candidate cap for the step-3 picker dropdown (renewal member search precedent). */
const BUSINESS_SEARCH_LIMIT = 8

async function searchLiveBusinesses(search: string): Promise<BusinessPickerItem[]> {
	const params = new URLSearchParams({ limit: String(BUSINESS_SEARCH_LIMIT) })
	if (search !== "") {
		params.set("search", search)
	}
	const result = await fetchJson<{ businesses: BusinessPickerItem[] }>(`/api/v1/business/search?${params.toString()}`)
	if (result.isErr()) {
		throw result.error
	}
	return result.value.businesses
}

/**
 * First page of the business autocomplete for wizard step 3's ผูกกิจการที่มีอยู่แล้ว
 * picker (#70) — one fetch per debounced term, no cursor paging (the dropdown
 * shows a short candidate list). The server is the filter (escaped prefix over
 * business name + juristic registration no), so the combobox renders rows verbatim.
 */
export function useBusinessSearch(search: string) {
	return useQuery<BusinessPickerItem[], ApiError>({
		queryKey: [...BUSINESS_SEARCH_QUERY_KEY, search],
		queryFn: () => searchLiveBusinesses(search),
		enabled: search !== "",
		// Same 30s freshness window as the renewal member search — the picker is
		// inside a dialog, so focus jitters shouldn't refetch mid-pick.
		staleTime: 30_000,
	})
}
