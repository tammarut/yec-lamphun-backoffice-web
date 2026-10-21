import type { ExecutiveCommitteeNode } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"

/** Shared committee-tree fixtures for the organization component tests. */
export function makeCommitteeNode(overrides: Partial<ExecutiveCommitteeNode> = {}): ExecutiveCommitteeNode {
	return {
		id: 1,
		profile_avatar: null,
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		nickname: "ชาย",
		position: "ประธาน",
		business_name: "ร้านกาแฟสมชาย",
		children: [],
		...overrides,
	}
}

/** A Vacant Position placeholder — only the Thai position title is present. */
export function makeVacantNode(overrides: Partial<ExecutiveCommitteeNode> = {}): ExecutiveCommitteeNode {
	return {
		id: null,
		profile_avatar: null,
		title_name_th: null,
		first_name_th: null,
		last_name_th: null,
		nickname: null,
		position: "รองประธานฝ่ายกฎหมาย",
		business_name: null,
		children: [],
		...overrides,
	}
}
