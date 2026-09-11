"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"

/** Full detail query key — invalidation matches on the ["members", "detail"] prefix. */
export const memberDetailQueryKey = (id: number) => ["members", "detail", id] as const

/**
 * GET /api/v1/members/:id for the edit wizard (3b-edit). Disabled while `id`
 * is null so create mode never fetches. The response carries the Masked ID
 * Card and freshly minted presigned private-file URLs (1-hour TTL) — an
 * expired preview recovers by invalidating this query, never via the
 * deprecated standalone presign endpoint.
 */
export function useMemberDetail(id: number | null) {
	return useQuery<MemberDetailResponse, ApiError, MemberDetailResponse, readonly ["members", "detail", number | null]>({
		queryKey: ["members", "detail", id],
		queryFn: async () => {
			const result = await fetchJson<MemberDetailResponse>(`/api/v1/members/${id}`)
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
		enabled: id !== null,
	})
}
