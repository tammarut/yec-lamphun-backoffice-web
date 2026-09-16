import type { RenewalStatus } from "src/modules/membership-renewals/domain/membership-renewal"

/**
 * Thai display vocabulary for the membership-renewal worklist UI.
 *
 * Copies of the members module's client display maps (`member-labels.ts`) —
 * the established convention is that each module ships its own copy of pure
 * label data rather than cross-importing another module's components (same
 * reason the member wizard ships its own SINGLE_CARDINALITY_POSITIONS copy).
 */

/** Official `positions.name_th` values from `seed-positions.sql`. The list API returns raw codes, so the client owns this map. */
export const POSITION_LABELS: Readonly<Record<string, string>> = {
	GENERAL_MEMBER: "สมาชิกทั่วไป",
	PRESIDENT: "ประธาน YEC Lamphun",
	ADVISORY_BOARD: "กรรมการที่ปรึกษา",
	SECRETARY: "เลขาธิการ",
	TREASURER: "เหรัญญิก",
	ASST_SECRETARY: "ผู้ช่วยเลขาธิการ",
	LEGAL_COORDINATOR: "ผู้ประสานงานด้านกฎหมายและข้อบังคับ",
	VP_ADMIN_INTERNAL: "รองประธานฝ่ายบริหารและประสานงานภายใน",
	VP_BUSINESS_INNOVATION: "รองประธานฝ่ายพัฒนาธุรกิจและนวัตกรรม",
	VP_NETWORK_INTERNATIONAL: "รองประธานฝ่ายเครือข่ายและต่างประเทศ",
	VP_PR_IMAGE: "รองประธานฝ่ายประชาสัมพันธ์และภาพลักษณ์",
	VP_ACTIVITIES_RELATIONS: "รองประธานฝ่ายกิจกรรมและสัมพันธ์สมาชิก",
	VP_DATA_REGISTRATION: "รองประธานฝ่ายข้อมูลและทะเบียนสมาชิก",
	COMM_ADMIN_INTERNAL: "กรรมการฝ่ายบริหารและประสานงานภายใน",
	COMM_BUSINESS_INNOVATION: "กรรมการฝ่ายพัฒนาธุรกิจและนวัตกรรม",
	COMM_NETWORK_INTERNATIONAL: "กรรมการฝ่ายเครือข่ายและต่างประเทศ",
	COMM_PR_IMAGE: "กรรมการฝ่ายประชาสัมพันธ์และภาพลักษณ์",
	COMM_ACTIVITIES_RELATIONS: "กรรมการฝ่ายกิจกรรมและสัมพันธ์สมาชิก",
	COMM_DATA_REGISTRATION: "กรรมการฝ่ายข้อมูลและทะเบียนสมาชิก",
}

/** Thai label for a position code; unknown codes fall back to the raw code. */
export function positionLabel(code: string): string {
	return POSITION_LABELS[code] ?? code
}

/** The name fields the worklist labels need off the expired-list row. */
type ExpiredMembershipNameFields = {
	title_name_th: string
	first_name_th: string
	last_name_th: string
}

/** Full Thai display name: title glued to the first name, space before surname (mockup format). */
export function fullNameTh(member: Pick<ExpiredMembershipNameFields, "title_name_th" | "first_name_th" | "last_name_th">): string {
	return `${member.title_name_th}${member.first_name_th} ${member.last_name_th}`
}

/** Badge tone per Renewal Status — drives semantic token classes in views. */
export type RenewalStatusBadgeTone = "success" | "warning" | "pending" | "destructive"

/**
 * Renewal Status pill per the mockup v3 vocabulary, with the user's color
 * mapping (2026-09-16): รอตรวจสอบ (PENDING_REVIEW, soft yellow = pending
 * action), ปกติ (APPROVED, green), ไม่อนุมัติ (REJECTED, red). The REJECTED
 * label is audience-aware — admins see ไม่อนุมัติ, members see the
 * กรุณาติดต่อเจ้าหน้าที่ contact-staff wording.
 */
export function renewalStatusLabel(status: RenewalStatus, isAdmin: boolean): string {
	if (status === "REJECTED") {
		return isAdmin ? "ไม่อนุมัติ" : "กรุณาติดต่อเจ้าหน้าที่"
	}
	if (status === "APPROVED") {
		return "ปกติ"
	}
	return "รอตรวจสอบ"
}

/** Badge tone for a Renewal Status (audience-independent). */
export function renewalStatusTone(status: RenewalStatus): RenewalStatusBadgeTone {
	if (status === "REJECTED") {
		return "destructive"
	}
	if (status === "APPROVED") {
		return "success"
	}
	return "pending"
}
