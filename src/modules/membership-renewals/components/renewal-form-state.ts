import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

/** Per-file size limit (7MB) and image extensions — mirrors the upload API's server rules (same client copy convention as card 03). */
export const MAX_SLIP_FILE_SIZE_BYTES = 7 * 1024 * 1024
export const SLIP_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const

/**
 * The member fields the form's ① section displays. Deliberately looser than
 * `MemberListItemResponse`: manual mode preselects from an expired-worklist
 * row, which carries no business name (API wins over the mockup's business
 * line — same precedent as the PR 2 rejected rows).
 */
export type RenewalFormMember = {
	readonly id: number
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly position: string
	readonly status: string
	readonly businessName: string | null
}

/** A staged slip file plus its CSP-safe preview (card-03 pattern) — blob: is not allowed by the app's img-src. */
export type StagedSlip = {
	readonly file: File
	readonly dataUrl: string
}

/** Adapt an autocomplete hit into the form's selected-member shape. */
export function memberListItemToFormMember(member: MemberListItemResponse): RenewalFormMember {
	return {
		id: member.id,
		profile_avatar: member.profile_avatar,
		title_name_th: member.title_name_th,
		first_name_th: member.first_name_th,
		last_name_th: member.last_name_th,
		nickname: member.nickname,
		position: member.position,
		status: member.status,
		businessName: member.business.name,
	}
}

/** Adapt an expired/ rejected worklist row into the form's selected-member shape (manual mode). */
export function expiredMembershipToFormMember(member: ExpiredMembershipResponse): RenewalFormMember {
	return {
		id: member.id,
		profile_avatar: member.profile_avatar,
		title_name_th: member.title_name_th,
		first_name_th: member.first_name_th,
		last_name_th: member.last_name_th,
		nickname: member.nickname,
		position: member.position,
		status: member.status,
		businessName: null,
	}
}

/**
 * Same-business predicate — TRUE only when BOTH business names are known and
 * equal. Drives both the amber cross-business warning (via the negation seen
 * from the card) and the 4,000 same-business additional rate; an unknown
 * business (manual-mode main) therefore prices at full 5,000 with no warning.
 */
export function isSameBusiness(member: RenewalFormMember, main: RenewalFormMember | null): boolean {
	return main !== null && member.businessName !== null && main.businessName !== null && member.businessName === main.businessName
}

/** Cross-business amber warning predicate (ADR-0026 §5: a warning, never a block). */
export function isCrossBusiness(member: RenewalFormMember, main: RenewalFormMember | null): boolean {
	return main !== null && member.businessName !== null && main.businessName !== null && member.businessName !== main.businessName
}

/** Client-side slip validation — mirrors the server's extension + 7MB rules; an error string is display copy. */
export function validateSlipFile(file: File): string | null {
	const extension = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`
	if (!(SLIP_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
		return `รองรับเฉพาะไฟล์รูปภาพ (${SLIP_ALLOWED_EXTENSIONS.join(", ")})`
	}
	if (file.size > MAX_SLIP_FILE_SIZE_BYTES) {
		return "ขนาดไฟล์ต้องไม่เกิน 7MB"
	}
	return null
}

/** The send lifecycle: idle → sending → (success | back to idle with an error). */
export type RenewalSendStatus = "idle" | "sending" | "success"

export type RenewalFormState = {
	/** ① the main member; manual mode starts preselected. */
	readonly selected: RenewalFormMember | null
	/** ② up to five additional members (one slip for the whole group, ADR-0026). */
	readonly additional: RenewalFormMember[]
	/** ②'s search combobox visibility (opens via + เพิ่มสมาชิก). */
	readonly pickerOpen: boolean
	/** ③ the staged slip + preview; null until a valid file is read. */
	readonly slip: StagedSlip | null
	/** ③'s client-side validation message. */
	readonly slipError: string | null
	/** ④ PDPA consent. */
	readonly consent: boolean
	/** Whether ส่งข้อมูล has been pressed since the last field change — gates the missing-fields summary. */
	readonly submitAttempted: boolean
	/** Inline failure copy from the last send (never cleared by field edits — only by the next attempt). */
	readonly submitError: string | null
	readonly sendStatus: RenewalSendStatus
}

export function createRenewalFormState(preselectedMember: RenewalFormMember | null): RenewalFormState {
	return {
		selected: preselectedMember,
		additional: [],
		pickerOpen: false,
		slip: null,
		slipError: null,
		consent: false,
		submitAttempted: false,
		submitError: null,
		sendStatus: "idle",
	}
}

export type RenewalFormAction =
	| { type: "PICK_MAIN"; member: RenewalFormMember }
	| { type: "CLEAR_MAIN" }
	| { type: "ADD_ADDITIONAL"; member: RenewalFormMember }
	| { type: "REMOVE_ADDITIONAL"; id: number }
	| { type: "OPEN_ADDITIONAL_PICKER" }
	| { type: "STAGE_SLIP"; slip: StagedSlip }
	| { type: "REJECT_SLIP"; message: string }
	| { type: "CLEAR_SLIP" }
	| { type: "SET_CONSENT"; checked: boolean }
	| { type: "SUBMIT_ATTEMPT" }
	| { type: "SEND_START" }
	| { type: "SEND_FAIL"; message: string }
	| { type: "SEND_SUCCESS" }

/**
 * The renewal dialog's form state, one pure reducer over the transitions that
 * used to be 12 separate useStates. Field changes (①②③④) clear
 * `submitAttempted` so the missing-fields summary re-arms for the next
 * attempt; `submitError` deliberately survives field edits and is cleared
 * only by the next attempt (SUBMIT_ATTEMPT).
 */
export function renewalFormReducer(state: RenewalFormState, action: RenewalFormAction): RenewalFormState {
	switch (action.type) {
		case "PICK_MAIN":
			return { ...state, selected: action.member, pickerOpen: false, submitAttempted: false }
		case "CLEAR_MAIN":
			// Additionals survive a main swap (user decision #87) — warnings and
			// the fee recompute against the new main.
			return { ...state, selected: null, pickerOpen: false }
		case "ADD_ADDITIONAL":
			return { ...state, additional: [...state.additional, action.member], pickerOpen: false, submitAttempted: false }
		case "REMOVE_ADDITIONAL":
			return { ...state, additional: state.additional.filter((member) => member.id !== action.id), submitAttempted: false }
		case "OPEN_ADDITIONAL_PICKER":
			return { ...state, pickerOpen: true, submitAttempted: false }
		case "STAGE_SLIP":
			return { ...state, slip: action.slip, slipError: null }
		case "REJECT_SLIP":
			return { ...state, slipError: action.message }
		case "CLEAR_SLIP":
			return { ...state, slip: null }
		case "SET_CONSENT":
			return { ...state, consent: action.checked }
		case "SUBMIT_ATTEMPT":
			return { ...state, submitAttempted: true, submitError: null }
		case "SEND_START":
			return { ...state, sendStatus: "sending" }
		case "SEND_FAIL":
			return { ...state, sendStatus: "idle", submitError: action.message }
		case "SEND_SUCCESS":
			return { ...state, sendStatus: "success" }
	}
}
