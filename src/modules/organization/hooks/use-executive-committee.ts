"use client"
import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { GetExecutiveCommitteeResponse } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"

export const EXECUTIVE_COMMITTEE_QUERY_KEY = ["organization", "executive-committee"] as const

/**
 * The Executive Committee tree feeding /organization (GET
 * /api/v1/members/executive-committee, public). The body is the
 * President-rooted node tree, or JSON `null` when no live PRESIDENT holder
 * exists (ADR-0020) — `null` is a successful data state here, not an error.
 * The only failure mode is infra (500), surfaced as ApiError.
 */
export function useExecutiveCommittee() {
	return useQuery<GetExecutiveCommitteeResponse, ApiError>({
		queryKey: EXECUTIVE_COMMITTEE_QUERY_KEY,
		staleTime: 30_000,
		queryFn: async () => {
			const result = await fetchJson<GetExecutiveCommitteeResponse>("/api/v1/members/executive-committee")
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
	})
}
