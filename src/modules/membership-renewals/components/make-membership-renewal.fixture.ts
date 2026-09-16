import type { MembershipRenewalResponse } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"

/**
 * รอตรวจสอบ/ปกติ renewal-row fixture with realistic defaults (mirrors
 * make-expired-membership). `overrides` wins on every key, so tests can flip
 * `status` (PENDING_REVIEW / APPROVED) per scenario.
 */
export function makeMembershipRenewal(overrides: Partial<MembershipRenewalResponse> = {}): MembershipRenewalResponse {
	return {
		id: 101,
		renewal_id: 9001,
		profile_avatar: null,
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		nickname: "ชาย",
		phone_no: "081-234-5678",
		position: "GENERAL_MEMBER",
		status: "PENDING_REVIEW",
		member_since: "2024-06-01T00:00:00.000Z",
		payment_date_at: "2026-09-10T03:30:00.000Z",
		...overrides,
	}
}
