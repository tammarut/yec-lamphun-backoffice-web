import type { MemberListItem } from "src/shared/components/members/members-types"

/** Shared member fixture for the members component tests. */
export function makeMember(overrides: Partial<MemberListItem> = {}): MemberListItem {
	return {
		id: 1,
		profile_avatar: null,
		registration_type: "INDIVIDUAL",
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		nickname: "ชาย",
		phone_no: "089-111-2222",
		email: "somchai@example.com",
		line_id: "somchai",
		position: "GENERAL_MEMBER",
		status: "ACTIVE",
		business: { name: "ร้านกาแฟสมชาย", description: "กาแฟคั่วบด" },
		...overrides,
	}
}
