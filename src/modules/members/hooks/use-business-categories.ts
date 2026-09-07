"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

export const BUSINESS_CATEGORIES_QUERY_KEY = ["business", "categories"] as const

/** One หมวดธุรกิจ option — the wire shape of GET /api/v1/business/categories (`category_name`, not `name`). */
export type BusinessCategoryOption = {
	readonly id: number
	readonly category_name: string
}

async function fetchBusinessCategories(): Promise<BusinessCategoryOption[]> {
	const result = await fetchJson<{ business_categories: BusinessCategoryOption[] }>("/api/v1/business/categories")
	if (result.isErr()) {
		throw result.error
	}
	return result.value.business_categories
}

/**
 * Live-fed category select options (README §8 item 10: the mockup's 14
 * numbered strings are vocabulary only — never hardcode the list).
 */
export function useBusinessCategories() {
	return useQuery<BusinessCategoryOption[], ApiError>({
		queryKey: BUSINESS_CATEGORIES_QUERY_KEY,
		queryFn: fetchBusinessCategories,
	})
}
