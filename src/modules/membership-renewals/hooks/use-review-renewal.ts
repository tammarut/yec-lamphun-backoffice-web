"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import { RENEWALS_ROOT_QUERY_KEY } from "src/modules/membership-renewals/hooks/use-create-renewal"

export type ReviewRenewalInput =
	| { readonly renewalId: number; readonly decision: "APPROVED" }
	| { readonly renewalId: number; readonly decision: "REJECTED"; readonly reason: string }

/** The review PATCH answers 204 with an empty body. */
type ReviewRenewalResponse = undefined

async function patchReview(input: ReviewRenewalInput): Promise<ReviewRenewalResponse> {
	const body = input.decision === "REJECTED" ? { status: input.decision, reason: input.reason } : { status: input.decision }
	const result = await fetchJson<ReviewRenewalResponse>(`/api/v1/membership/renewals/review/${String(input.renewalId)}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Renewal Review (ADR-0018 guarded transition). 409 = someone decided it
 * first — the dialog shows that error INLINE and the settle-time invalidate
 * refetches the lists so the stale row leaves the queue either way.
 */
export function useReviewRenewal() {
	const queryClient = useQueryClient()
	return useMutation<ReviewRenewalResponse, ApiError, ReviewRenewalInput>({
		mutationFn: patchReview,
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: RENEWALS_ROOT_QUERY_KEY })
		},
	})
}
