import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

/** Shared general-member (grid chip) fixture for the organization component tests. */
export function makeGeneralMember(overrides: Partial<MemberListItemResponse> = {}): MemberListItemResponse {
	return {
		id: 1,
		profile_avatar: null,
		registration_type: "INDIVIDUAL",
		title_name_th: "นาย",
		first_name_th: "สมหญิง",
		last_name_th: "ใจดี",
		nickname: "หญิง",
		phone_no: "089-111-2222",
		email: null,
		line_id: null,
		position: "GENERAL_MEMBER",
		status: "ACTIVE",
		business: { name: "ร้านกาแฟสมชาย", description: "กาแฟคั่วบด" },
		...overrides,
	}
}
