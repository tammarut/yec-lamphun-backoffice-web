"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { RENEWALS_ROOT_QUERY_KEY } from "src/modules/membership-renewals/hooks/use-create-renewal"
import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

async function postResign(id: number): Promise<void> {
	const result = await fetchJson<null>(`/api/v1/members/${id}/resign`, { method: "POST" })
	if (result.isErr()) {
		throw result.error
	}
}

/**
 * ลาออก (resign) an EXPIRED member — command on POST /api/v1/members/:id/resign
 * (RENEWAL-1, #113). On success, one root-key invalidation refetches the
 * expired table, the stat cards, and the review list together (rows leave /
 * counts drop). A failed resign (404/409) has zero server-side effect, so the
 * cache is NOT invalidated — invalidation lives in onSuccess, not onSettled.
 */
export function useResignMember() {
	const queryClient = useQueryClient()
	return useMutation<void, ApiError, number>({
		mutationFn: postResign,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: RENEWALS_ROOT_QUERY_KEY })
		},
	})
}
