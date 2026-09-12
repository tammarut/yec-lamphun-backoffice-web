"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { MemberFileFieldName } from "src/modules/members/member-file.constants"
import { buildUploadFormData } from "src/modules/members/hooks/use-create-member"
import { MEMBERS_LIST_QUERY_KEY } from "src/modules/members/hooks/use-members"
import { memberDetailQueryKey } from "src/modules/members/hooks/use-member-detail"
import { buildUpdatePayload, type UploadedFilePaths } from "src/modules/members/schemas/member-wizard-mapping"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

type UploadResponse = {
	readonly [K in `${MemberFileFieldName}_file_path`]: string | null
}

export type UpdateMemberVariables = {
	id: number
	values: MemberWizardFormValues
}

async function updateMember({ id, values }: UpdateMemberVariables): Promise<void> {
	// Uploads-first, create-flow pattern: only CHANGED files are staged in the
	// form (`{ file, existingUrl }` pairs), so the multipart POST carries just
	// those; every other file field rides the PATCH as JSON null — the
	// null-sticky "keep the stored value" rule (ADR-0012).
	const formData = buildUploadFormData(values)
	let uploads: UploadedFilePaths | null = null
	if (formData !== null) {
		const uploadResult = await fetchJson<UploadResponse>("/api/v1/members/file/upload", {
			method: "POST",
			body: formData,
		})
		if (uploadResult.isErr()) {
			throw uploadResult.error
		}
		uploads = uploadResult.value
	}

	const patchResult = await fetchJson<null>(`/api/v1/members/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(buildUpdatePayload(values, uploads)),
	})
	if (patchResult.isErr()) {
		throw patchResult.error
	}
}

/**
 * Edit a member from validated wizard values (PATCH, ADR-0012 hybrid
 * semantics). Cache action is INVALIDATE, not the create/delete RESET: an
 * edit never changes `created_at`, so the keyset-cursor page anchors
 * (ADR-0011) stay valid and every accumulated page can simply refetch with
 * its stored cursor. The detail query is invalidated too, so reopening the
 * wizard (or an expired presigned preview) sees fresh data. UI transitions
 * (success dialog) are owned by the caller.
 */
export function useUpdateMember() {
	const queryClient = useQueryClient()
	return useMutation<void, ApiError, UpdateMemberVariables>({
		mutationFn: updateMember,
		onSuccess: (_void, variables) => {
			void queryClient.invalidateQueries({ queryKey: MEMBERS_LIST_QUERY_KEY })
			void queryClient.invalidateQueries({ queryKey: memberDetailQueryKey(variables.id) })
		},
	})
}
