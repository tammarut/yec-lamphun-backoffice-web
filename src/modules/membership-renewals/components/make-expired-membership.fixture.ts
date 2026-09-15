import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"

/**
 * Expired-membership row fixture with realistic defaults. `overrides` wins on
 * every key, so tests can flip `latest_renewal_status` / rejection fields per
 * scenario (REJECTED rows carry reason + date; others null).
 */
export function makeExpiredMembership(overrides: Partial<ExpiredMembershipResponse> = {}): ExpiredMembershipResponse {
	return {
		id: 101,
		profile_avatar: null,
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		nickname: "ชาย",
		phone_no: "081-234-5678",
		position: "GENERAL_MEMBER",
		status: "EXPIRED",
		latest_renewal_status: null,
		member_since: "2024-06-01T00:00:00.000Z",
		rejection_reason: null,
		rejected_at: null,
		...overrides,
	}
}
