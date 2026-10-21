"use client"
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { ListMembersPageResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

/** Page size for the org grid — same as the members directory list. */
export const ORGANIZATION_MEMBERS_PAGE_LIMIT = 20

/**
 * The members list cache root — the identical literal key the members
 * module's `useMembers` hook uses, so both pages share one cache tree
 * (the org module ships its own hook; only the key is shared).
 */
const MEMBERS_LIST_ROOT_QUERY_KEY = ["members", "list"] as const

/** The one fixed query the general-members grid always issues. */
export const ORGANIZATION_MEMBERS_QUERY_KEY = [...MEMBERS_LIST_ROOT_QUERY_KEY, "position=GENERAL_MEMBER&status=ACTIVE,PENDING_RENEWAL,EXPIRED"] as const

type OrganizationMembersKey = typeof ORGANIZATION_MEMBERS_QUERY_KEY

const GENERAL_MEMBERS_PARAMS = {
	position: "GENERAL_MEMBER",
	// The exact liveness trio the executive-committee read uses — deleted and
	// RESIGNED members never appear anywhere on /organization.
	status: "ACTIVE,PENDING_RENEWAL,EXPIRED",
} as const

async function fetchOrganizationMembersPage(cursor: string | null): Promise<ListMembersPageResponse> {
	const params = new URLSearchParams({
		limit: String(ORGANIZATION_MEMBERS_PAGE_LIMIT),
		...GENERAL_MEMBERS_PARAMS,
	})
	if (cursor !== null) {
		params.set("cursor", cursor)
	}
	const result = await fetchJson<ListMembersPageResponse>(`/api/v1/members?${params.toString()}`)
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Cursor-accumulating general-members grid (ADR-0011 keyset pagination) —
 * pattern copy of the members list hook for the org module's fixed
 * `position=GENERAL_MEMBER` + live-status trio filter. `has_more: false`
 * ends the chain via an `undefined` next cursor.
 */
export function useOrganizationMembers() {
	return useInfiniteQuery<ListMembersPageResponse, ApiError, InfiniteData<ListMembersPageResponse>, OrganizationMembersKey, string | null>({
		queryKey: ORGANIZATION_MEMBERS_QUERY_KEY,
		queryFn: ({ pageParam }) => fetchOrganizationMembersPage(pageParam),
		initialPageParam: null,
		getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
	})
}
