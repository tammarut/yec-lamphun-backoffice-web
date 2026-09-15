"use client"

import { useQuery } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

/**
 * Feature-key map returned by the PUBLIC GET /api/v1/system-settings. The
 * endpoint may return more feature keys; the renewal gate only reads this one,
 * so the client type narrows to it.
 */
export type SystemSettingsResponse = {
	readonly open_membership_renewal: boolean
}

export const SYSTEM_SETTINGS_QUERY_KEY = ["system-settings"] as const

export function useSystemSettings() {
	return useQuery<SystemSettingsResponse, ApiError>({
		queryKey: SYSTEM_SETTINGS_QUERY_KEY,
		queryFn: async () => {
			const result = await fetchJson<SystemSettingsResponse>("/api/v1/system-settings")
			if (result.isErr()) {
				throw result.error
			}
			return result.value
		},
	})
}
