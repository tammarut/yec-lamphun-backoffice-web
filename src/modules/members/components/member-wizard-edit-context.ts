"use client"

import { createContext, useContext } from "react"

import type { MemberWizardFileFieldName } from "src/modules/members/schemas/member-wizard-schema"
import type { MemberRenewalDisplay } from "src/modules/members/schemas/member-wizard-mapping"

/**
 * Edit-mode context for the member wizard (3b-edit). Null in create mode —
 * every consumer treats null as "create behavior". Provided by
 * MemberWizardDialog from the live GET /:id query, NOT from form state, so a
 * presign-expiry refetch (fresh URLs, same member) re-renders every preview
 * without touching the user's in-progress edits.
 */
export type MemberWizardEditContextValue = {
	/** Renewal block read-only display (renewal-owned, card 04). */
	renewal: MemberRenewalDisplay
	/** The Masked ID Card from GET /:id — display-only, never form state. */
	maskedIdCardNo: string | null
	/** Live resolved file URLs (presigned for private files), keyed by form field. */
	existingUrls: Readonly<Record<MemberWizardFileFieldName, string | null>>
	/**
	 * Live members linked to the member's current business (GET /:id's
	 * business.member_count, self-included) — powers the #71 shared-edit
	 * warning on the step-3 manual branch. Point-in-time snapshot like every
	 * other field here: refreshed only when the detail query refetches, not
	 * while the dialog sits open (scrutiny N1 — informational, not a gate).
	 */
	businessMemberCount: number
	/**
	 * A stored file's preview failed to load (expired presign or missing
	 * object). The dialog refetches the detail — the response carries freshly
	 * minted URLs. Capped per field by the dialog, so a genuinely missing
	 * object cannot loop.
	 */
	onExistingImageError: (field: MemberWizardFileFieldName) => void
}

export const MemberWizardEditContext = createContext<MemberWizardEditContextValue | null>(null)

/** Read the wizard's edit context; null means create mode. */
export function useMemberWizardEdit(): MemberWizardEditContextValue | null {
	return useContext(MemberWizardEditContext)
}
