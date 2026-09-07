import type { MemberListItem, MemberStatus } from "src/shared/components/members/members-types"

/**
 * Thai display vocabulary for the members UI.
 *
 * Position labels are the official `positions.name_th` values from
 * `seed-positions.sql` (the mockup's `yecPositions` wording matches verbatim).
 * The list API returns raw codes, so the client owns this map.
 */

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

/** Badge tone per Member Status — drives semantic token classes in views. */
export type StatusBadgeTone = "success" | "warning" | "muted"

/**
 * Status Badge display per CONTEXT.md: ACTIVE → ปกติ; EXPIRED and
 * PENDING_RENEWAL → ยังไม่ได้ต่ออายุ (the dashboard's not-yet-renewed union);
 * RESIGNED → ลาออก. Staff-only display — views render it under `isAdmin` only.
 */
export const STATUS_BADGES: Readonly<Record<MemberStatus, { label: string; tone: StatusBadgeTone }>> = {
	ACTIVE: { label: "ปกติ", tone: "success" },
	EXPIRED: { label: "ยังไม่ได้ต่ออายุ", tone: "warning" },
	PENDING_RENEWAL: { label: "ยังไม่ได้ต่ออายุ", tone: "warning" },
	RESIGNED: { label: "ลาออก", tone: "muted" },
}

/** Badge label for a Member Status. */
export function statusBadgeLabel(status: MemberStatus): string {
	return STATUS_BADGES[status].label
}

/** Full Thai display name: title glued to the first name, space before surname (mockup format). */
export function fullNameTh(member: Pick<MemberListItem, "title_name_th" | "first_name_th" | "last_name_th">): string {
	return `${member.title_name_th}${member.first_name_th} ${member.last_name_th}`
}
