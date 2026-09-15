"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import { SYSTEM_SETTINGS_QUERY_KEY, type SystemSettingsResponse } from "src/modules/membership-renewals/hooks/use-system-settings"

export type UpdateSystemSettingsInput = {
	readonly open_membership_renewal: boolean
}

async function patchSystemSettings(input: UpdateSystemSettingsInput): Promise<SystemSettingsResponse> {
	const result = await fetchJson<SystemSettingsResponse>("/api/v1/system-settings", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	})
	if (result.isErr()) {
		throw result.error
	}
	return result.value
}

/**
 * Admin เปิด/ปิด toggle — the only write in PR 2b, and it is a settings write,
 * not a renewal write. Optimistically flips the cached settings map (setQueryData
 * BEFORE the settle-time invalidate) so the gate and red banner react instantly,
 * rolls back on failure, and re-syncs from the server once the mutation settles.
 */
export function useUpdateSystemSettings() {
	const queryClient = useQueryClient()
	return useMutation<SystemSettingsResponse, ApiError, UpdateSystemSettingsInput, { previous: SystemSettingsResponse | undefined }>({
		mutationFn: patchSystemSettings,
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY })
			const previous = queryClient.getQueryData<SystemSettingsResponse>(SYSTEM_SETTINGS_QUERY_KEY)
			queryClient.setQueryData<SystemSettingsResponse>(SYSTEM_SETTINGS_QUERY_KEY, { ...previous, ...input })
			return { previous }
		},
		onError: (error, _input, context) => {
			if (context) {
				queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, context.previous)
			}
			toast.error(`บันทึกการตั้งค่าไม่สำเร็จ: ${error.message}`)
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY })
		},
	})
}
