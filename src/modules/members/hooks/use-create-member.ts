"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import type { MemberFileFieldName } from "src/modules/members/member-file.constants"
import { MEMBERS_LIST_QUERY_KEY } from "src/modules/members/hooks/use-members"
import { buildCreatePayload, type UploadedFilePaths } from "src/modules/members/schemas/member-wizard-mapping"
import type { MemberFileValue, MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

type CreatedMemberResponse = {
	readonly id: number
}

/** The upload endpoint's response: every `*_file_path` key, null when that field carried no file. */
type UploadResponse = {
	readonly [K in `${MemberFileFieldName}_file_path`]: string | null
}

/** Wizard form file field → canonical multipart field name (MEMBER_FILE_FIELDS vocabulary). */
function wizardFileFields(values: MemberWizardFormValues): readonly { value: MemberFileValue; multipartName: MemberFileFieldName }[] {
	return [
		{ value: values.company_certificate, multipartName: "company_certificate" },
		{ value: values.id_card_image, multipartName: "id_card_image" },
		{ value: values.profile_avatar, multipartName: "profile_avatar" },
		{ value: values.business.logo, multipartName: "business_logo" },
		{ value: values.business.product, multipartName: "business_product" },
	]
}

function buildUploadFormData(values: MemberWizardFormValues): FormData | null {
	const form = new FormData()
	let hasAnyFile = false
	for (const { value, multipartName } of wizardFileFields(values)) {
		if (value.file !== null) {
			form.append(multipartName, value.file)
			hasAnyFile = true
		}
	}
	// The upload endpoint rejects an empty request ("At least one file must be
	// provided") — skip it entirely when nothing was picked.
	return hasAnyFile ? form : null
}

async function createMember(values: MemberWizardFormValues): Promise<CreatedMemberResponse> {
	// Uploads-first (one multipart POST at submit, per the OpenAPI two-step
	// diagram): collect every selected file, then attach the returned paths.
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

	const createResult = await fetchJson<CreatedMemberResponse>("/api/v1/members", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(buildCreatePayload(values, uploads)),
	})
	if (createResult.isErr()) {
		throw createResult.error
	}
	return createResult.value
}

/**
 * Create a member from validated wizard values. Cache action is a RESET for
 * the same keyset-cursor reason as the delete mutation (ADR-0011): the new
 * member heads every `created_at desc` page 1, so every search variant
 * refetches from scratch. UI transitions (success dialog, draft clearing)
 * are owned by the caller.
 */
export function useCreateMember() {
	const queryClient = useQueryClient()
	return useMutation<CreatedMemberResponse, ApiError, MemberWizardFormValues>({
		mutationFn: createMember,
		onSuccess: () => {
			queryClient.resetQueries({ queryKey: MEMBERS_LIST_QUERY_KEY })
		},
	})
}
