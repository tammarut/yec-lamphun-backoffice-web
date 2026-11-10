import { describe, expect, test } from "vitest"

import {
	createRenewalFormState,
	expiredMembershipToFormMember,
	memberListItemToFormMember,
	renewalFormReducer,
	type RenewalFormMember,
	type RenewalFormState,
} from "./renewal-form-state"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

function makeMemberRow(overrides: Partial<MemberListItemResponse> & Pick<MemberListItemResponse, "id" | "first_name_th" | "last_name_th">): MemberListItemResponse {
	return {
		profile_avatar: null,
		registration_type: "INDIVIDUAL",
		title_name_th: "นาย",
		nickname: "",
		phone_no: "080-000-0000",
		email: null,
		line_id: null,
		position: "GENERAL_MEMBER",
		status: "EXPIRED",
		business: { name: "ร้านทดสอบ", description: "" },
		...overrides,
	}
}

const MAIN = memberListItemToFormMember(makeMemberRow({ id: 101, first_name_th: "สมชาย", last_name_th: "ใจดี" }))
const OTHER = memberListItemToFormMember(makeMemberRow({ id: 102, first_name_th: "สมศรี", last_name_th: "ใจสู้" }))

function manualRow(): ExpiredMembershipResponse {
	return {
		id: 202,
		profile_avatar: null,
		title_name_th: "นางสาว",
		first_name_th: "สมหญิง",
		last_name_th: "ใจงาม",
		nickname: "หญิง",
		phone_no: "089-888-8888",
		position: "GENERAL_MEMBER",
		status: "EXPIRED",
		latest_renewal_status: null,
		member_since: "2024-06-01T00:00:00.000Z",
		rejection_reason: null,
		rejected_at: null,
	}
}

function stateWithMain(): RenewalFormState {
	return createRenewalFormState(MAIN)
}

function makeSlip(): { file: File; dataUrl: string } {
	return { file: new File(["x"], "slip.png", { type: "image/png" }), dataUrl: "data:image/png;base64,x" }
}

describe("renewalFormReducer", () => {
	describe("initial state", () => {
		test("starts empty: no selection, no slip, no consent, idle send", () => {
			// Arrange / Act
			const state = createRenewalFormState(null)

			// Assert
			expect(state.selected).toBeNull()
			expect(state.additional).toEqual([])
			expect(state.pickerOpen).toBe(false)
			expect(state.slip).toBeNull()
			expect(state.slipError).toBeNull()
			expect(state.consent).toBe(false)
			expect(state.submitAttempted).toBe(false)
			expect(state.submitError).toBeNull()
			expect(state.sendStatus).toBe("idle")
		})

		test("manual mode seeds the preselected member", () => {
			// Arrange / Act
			const state = createRenewalFormState(expiredMembershipToFormMember(manualRow()))

			// Assert
			expect(state.selected?.id).toBe(202)
		})
	})

	describe("member selection", () => {
		test("PICK_MAIN sets the main member, closes the picker, and clears the attempted flag", () => {
			// Arrange
			const attempted = renewalFormReducer(createRenewalFormState(null), { type: "SUBMIT_ATTEMPT" })
			const pickerOpen = renewalFormReducer(attempted, { type: "OPEN_ADDITIONAL_PICKER" })

			// Act
			const state = renewalFormReducer(pickerOpen, { type: "PICK_MAIN", member: MAIN })

			// Assert
			expect(state.selected?.id).toBe(101)
			expect(state.pickerOpen).toBe(false)
			expect(state.submitAttempted).toBe(false)
		})

		test("CLEAR_MAIN removes the main member and closes the picker", () => {
			// Arrange
			const open = renewalFormReducer(stateWithMain(), { type: "OPEN_ADDITIONAL_PICKER" })

			// Act
			const state = renewalFormReducer(open, { type: "CLEAR_MAIN" })

			// Assert
			expect(state.selected).toBeNull()
			expect(state.pickerOpen).toBe(false)
		})

		test("ADD_ADDITIONAL appends, closes the picker, and clears the attempted flag", () => {
			// Arrange
			const open = renewalFormReducer(stateWithMain(), { type: "OPEN_ADDITIONAL_PICKER" })

			// Act
			const state = renewalFormReducer(open, { type: "ADD_ADDITIONAL", member: OTHER })

			// Assert
			expect(state.additional.map((member) => member.id)).toEqual([102])
			expect(state.pickerOpen).toBe(false)
			expect(state.submitAttempted).toBe(false)
		})

		test("REMOVE_ADDITIONAL drops only that member and clears the attempted flag", () => {
			// Arrange
			const two = renewalFormReducer(renewalFormReducer(stateWithMain(), { type: "ADD_ADDITIONAL", member: OTHER }), { type: "ADD_ADDITIONAL", member: MAIN })

			// Act
			const state = renewalFormReducer(two, { type: "REMOVE_ADDITIONAL", id: 102 })

			// Assert
			expect(state.additional.map((member) => member.id)).toEqual([101])
			expect(state.submitAttempted).toBe(false)
		})
	})

	describe("slip staging", () => {
		test("STAGE_SLIP stores the slip and clears a previous validation error", () => {
			// Arrange
			const rejected = renewalFormReducer(createRenewalFormState(null), { type: "REJECT_SLIP", message: "ขนาดไฟล์ต้องไม่เกิน 7MB" })

			// Act
			const state = renewalFormReducer(rejected, { type: "STAGE_SLIP", slip: makeSlip() })

			// Assert
			expect(state.slip?.file.name).toBe("slip.png")
			expect(state.slipError).toBeNull()
		})

		test("REJECT_SLIP records the message without staging a slip", () => {
			// Arrange / Act
			const state = renewalFormReducer(createRenewalFormState(null), { type: "REJECT_SLIP", message: "รองรับเฉพาะไฟล์รูปภาพ" })

			// Assert
			expect(state.slip).toBeNull()
			expect(state.slipError).toBe("รองรับเฉพาะไฟล์รูปภาพ")
		})

		test("CLEAR_SLIP removes the staged slip", () => {
			// Arrange
			const staged = renewalFormReducer(createRenewalFormState(null), { type: "STAGE_SLIP", slip: makeSlip() })

			// Act
			const state = renewalFormReducer(staged, { type: "CLEAR_SLIP" })

			// Assert
			expect(state.slip).toBeNull()
		})
	})

	describe("submit flow", () => {
		test("SUBMIT_ATTEMPT flags the attempt and clears a previous error", () => {
			// Arrange
			const failed = renewalFormReducer(stateWithMain(), { type: "SEND_FAIL", message: "ส่งข้อมูลไม่สำเร็จ: บางอย่าง" })

			// Act
			const state = renewalFormReducer(failed, { type: "SUBMIT_ATTEMPT" })

			// Assert
			expect(state.submitAttempted).toBe(true)
			expect(state.submitError).toBeNull()
		})

		test("SEND_START → SEND_SUCCESS walks idle → sending → success", () => {
			// Arrange
			const started = renewalFormReducer(stateWithMain(), { type: "SEND_START" })

			// Act
			const done = renewalFormReducer(started, { type: "SEND_SUCCESS" })

			// Assert
			expect(started.sendStatus).toBe("sending")
			expect(done.sendStatus).toBe("success")
		})

		test("SEND_FAIL returns to idle and carries the inline error copy", () => {
			// Arrange
			const started = renewalFormReducer(stateWithMain(), { type: "SEND_START" })

			// Act
			const state = renewalFormReducer(started, { type: "SEND_FAIL", message: "อัปโหลดสลิปไม่สำเร็จ: อัปโหลดไม่ได้" })

			// Assert
			expect(state.sendStatus).toBe("idle")
			expect(state.submitError).toBe("อัปโหลดสลิปไม่สำเร็จ: อัปโหลดไม่ได้")
		})
	})

	describe("Unhappy cases", () => {
		test("REMOVE_ADDITIONAL with an unknown id leaves the group unchanged", () => {
			// Arrange
			const one = renewalFormReducer(stateWithMain(), { type: "ADD_ADDITIONAL", member: OTHER })

			// Act
			const state = renewalFormReducer(one, { type: "REMOVE_ADDITIONAL", id: 999 })

			// Assert
			expect(state.additional.map((member) => member.id)).toEqual([102])
		})

		test("SET_CONSENT keeps false for non-true checkbox values", () => {
			// Arrange / Act
			const state = renewalFormReducer(createRenewalFormState(null), { type: "SET_CONSENT", checked: false })

			// Assert
			expect(state.consent).toBe(false)
		})

		test("reducer is pure: the previous state object is never mutated", () => {
			// Arrange
			const previous = renewalFormReducer(stateWithMain(), { type: "SUBMIT_ATTEMPT" })
			const stagedSlip = makeSlip()

			// Act
			const next = renewalFormReducer(previous, { type: "STAGE_SLIP", slip: stagedSlip })

			// Assert
			expect(previous.slip).toBeNull()
			expect(previous.submitAttempted).toBe(true)
			expect(next).not.toBe(previous)
		})
	})
})

describe("form member adapters", () => {
	test("memberListItemToFormMember keeps id, names and business name", () => {
		// Arrange / Act
		const member: RenewalFormMember = memberListItemToFormMember(makeMemberRow({ id: 7, first_name_th: "สมดี", last_name_th: "ใจงาม" }))

		// Assert
		expect(member.id).toBe(7)
		expect(member.businessName).toBe("ร้านทดสอบ")
	})

	test("expiredMembershipToFormMember carries no business name (the API gap that suppresses the ② warning)", () => {
		// Arrange / Act
		const member = expiredMembershipToFormMember(manualRow())

		// Assert
		expect(member.id).toBe(202)
		expect(member.businessName).toBeNull()
	})
})
