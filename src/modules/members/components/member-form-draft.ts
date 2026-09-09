import type { MemberFileValue, MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { MEMBER_WIZARD_DEFAULT_VALUES } from "src/modules/members/schemas/member-wizard-schema"

/**
 * Member Form Draft (CONTEXT.md): an autosaved snapshot of a partially filled
 * member-registration wizard, kept client-side in localStorage under the
 * single key `yec-member-form-draft`. Create mode only — edit mode never
 * reads or writes it. Member File selections are excluded (Files are not
 * serializable); the draft is cleared on successful submission or explicit
 * discard. Purely a browser-side concept — no API backs it.
 */

const DRAFT_STORAGE_KEY = "yec-member-form-draft"

type MemberFormDraftSnapshot = MemberWizardFormValues

/** Strip every File selection, keeping the rest of the form intact. */
function stripFiles(values: MemberWizardFormValues): MemberFormDraftSnapshot {
	const emptyFile = (): MemberFileValue => ({ file: null, existingUrl: null })
	return {
		...values,
		company_certificate: emptyFile(),
		id_card_image: emptyFile(),
		profile_avatar: emptyFile(),
		business: {
			...values.business,
			logo: emptyFile(),
			product: emptyFile(),
		},
	}
}

export function saveMemberFormDraft(values: MemberWizardFormValues): void {
	try {
		localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stripFiles(values)))
	} catch {
		// Storage unavailable (private mode/quota) — the draft is a nicety, never a blocker.
	}
}

/** Raw snapshot or null; corrupt or non-object entries are dropped. */
export function readMemberFormDraft(): MemberFormDraftSnapshot | null {
	let raw: string | null
	try {
		raw = localStorage.getItem(DRAFT_STORAGE_KEY)
	} catch {
		return null
	}
	if (raw === null) {
		return null
	}

	try {
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed !== "object" || parsed === null) {
			clearMemberFormDraft()
			return null
		}
		return parsed as MemberFormDraftSnapshot
	} catch {
		clearMemberFormDraft()
		return null
	}
}

/**
 * Draft merged over pristine defaults — fields added after the draft was
 * written still get their defaults, and every file pair starts empty.
 */
export function restoreMemberFormDraft(): MemberWizardFormValues | null {
	const draft = readMemberFormDraft()
	if (draft === null) {
		return null
	}
	const defaults = MEMBER_WIZARD_DEFAULT_VALUES()
	return {
		...defaults,
		...draft,
		company_certificate: { file: null, existingUrl: null },
		id_card_image: { file: null, existingUrl: null },
		profile_avatar: { file: null, existingUrl: null },
		business: {
			...defaults.business,
			...draft.business,
			logo: { file: null, existingUrl: null },
			product: { file: null, existingUrl: null },
		},
	}
}

export function clearMemberFormDraft(): void {
	try {
		localStorage.removeItem(DRAFT_STORAGE_KEY)
	} catch {
		// Storage unavailable — nothing to clear.
	}
}
