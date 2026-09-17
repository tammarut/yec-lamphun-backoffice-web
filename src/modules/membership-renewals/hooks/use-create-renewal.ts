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

type CreateRenewalResponse = { readonly id: number }

/**
 * Every renewal read hook keys under this prefix (list / stat / expired-list /
 * detail) — one invalidate refetches them all after any write.
 */
export const RENEWALS_ROOT_QUERY_KEY = ["membership-renewals"] as const

async function postRenewal(input: CreateRenewalInput): Promise<CreateRenewalResponse> {
	const url = input.manual ? "/api/v1/membership/renewals/manual" : "/api/v1/membership/renewals"
	const result = await fetchJson<CreateRenewalResponse>(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ member_id: input.member_id, payment_slip: input.payment_slip }),
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
