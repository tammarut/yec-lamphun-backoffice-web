"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

export type CreateRenewalInput = {
	/** Renewal Group members, main-first (index 0 = main member); 1..6 unique entries (ADR-0026). */
	readonly member_ids: readonly number[]
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

/**
 * Every renewal read hook keys under this prefix (list / stat / expired-list /
 * detail) — one invalidate refetches them all after any write.
 */
export const RENEWALS_ROOT_QUERY_KEY = ["membership-renewals"] as const

async function postRenewal(input: CreateRenewalInput): Promise<CreateRenewalResponse> {
	const url = input.manual ? "/api/v1/membership/renewals/manual" : "/api/v1/membership/renewals"
	// Both endpoints speak the SAME member_ids contract since #85 (ADR-0026) —
	// main-first order (index 0 = main). The fan-out UI filling 2..6 members
	// is ticket #87's form ② สมาชิกเพิ่มเติม.
	const body = { member_ids: [...input.member_ids], payment_slip: input.payment_slip }
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
