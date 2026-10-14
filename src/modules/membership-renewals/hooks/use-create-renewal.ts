"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

export type CreateRenewalInput = {
	readonly member_id: number
	/** Opaque R2 path returned by POST /api/v1/members/file/upload (field payment_slip). */
	readonly payment_slip: string
	/** true → POST /renewals/manual (admin: instant APPROVED + clock advance, ADR-0016). */
	readonly manual: boolean
}

type CreatedRenewalRow = {
	readonly member_id: number
	readonly renewal_id: number
}

type CreateRenewalResponse = {
	readonly renewals: ReadonlyArray<CreatedRenewalRow>
	/** Shared Renewal Group marker (ADR-0026); null on a solo submission. */
	readonly group_id: string | null
}
// NOTE: until #85, the /manual branch actually still returns the OLD `{ id }`
// body — this type describes the public branch, and the hook never reads the
// body anyway (the form renders success from local state). #85 unifies both.

/**
 * Every renewal read hook keys under this prefix (list / stat / expired-list /
 * detail) — one invalidate refetches them all after any write.
 */
export const RENEWALS_ROOT_QUERY_KEY = ["membership-renewals"] as const

async function postRenewal(input: CreateRenewalInput): Promise<CreateRenewalResponse> {
	const url = input.manual ? "/api/v1/membership/renewals/manual" : "/api/v1/membership/renewals"
	// ADR-0026 lockstep: the public endpoint takes member_ids[1..6] — a solo
	// submission sends [member_id]. The manual endpoint keeps the old member_id
	// contract until its own bulk flip (#85); delete this fork there.
	const body = input.manual ? { member_id: input.member_id, payment_slip: input.payment_slip } : { member_ids: [input.member_id], payment_slip: input.payment_slip }
	const result = await fetchJson<CreateRenewalResponse>(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Renewal Submission (CONTEXT.md): member mode uses the public endpoint where
 * a staff cookie forks the outcome to instant APPROVED (ADR-0015); manual mode
 * uses the staff-only /manual (ADR-0016). Errors surface INLINE in the form
 * dialog (409 pending-exists / 403 resigned / 404 member) — no toast here.
 */
export function useCreateRenewal() {
	const queryClient = useQueryClient()
	return useMutation<CreateRenewalResponse, ApiError, CreateRenewalInput>({
		mutationFn: postRenewal,
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: RENEWALS_ROOT_QUERY_KEY })
		},
	})
}
