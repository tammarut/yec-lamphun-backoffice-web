import type { MemberListItem, MemberStatus } from "src/modules/members/components/members-types"

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

/**
 * Positions restricted to a single concurrent holder (ADR-0006 SINGLE
 * cardinality, from `seed-positions.sql`). The wizard ships its own copy —
 * the conflict policy in `domain/` is a pure predicate and carries no data,
 * and components must not import the module's repository/use-case layers
 * where the seeded truth lives. Occupancy itself is server-checked; the
 * client only uses this set for the restricted-position hint.
 */
export const SINGLE_CARDINALITY_POSITIONS: ReadonlySet<string> = new Set([
	"PRESIDENT",
	"SECRETARY",
	"TREASURER",
	"LEGAL_COORDINATOR",
	"VP_ADMIN_INTERNAL",
	"VP_BUSINESS_INNOVATION",
	"VP_NETWORK_INTERNATIONAL",
	"VP_PR_IMAGE",
	"VP_ACTIVITIES_RELATIONS",
	"VP_DATA_REGISTRATION",
])

/** Shirt-size labels for the wizard's `ShirtSizeSchema` codes (mockup wording, chest in cm). */
export const SHIRT_SIZE_LABELS: Readonly<Record<string, string>> = {
	SSS: "SSS (อก 34)",
	SS: "SS (อก 36)",
	S: "S (อก 38)",
	M: "M (อก 40)",
	L: "L (อก 42)",
	XL: "XL (อก 44)",
	"2XL": "2XL (อก 46)",
	"3XL": "3XL (อก 48)",
	"4XL": "4XL (อก 50)",
}

/** Gender labels for the wizard's `GenderSchema` codes. */
export const GENDER_LABELS: Readonly<Record<string, string>> = {
	MALE: "ชาย",
	FEMALE: "หญิง",
	OTHER: "อื่นๆ",
}

/** Applicant-type labels for the wizard's `RegistrationTypeSchema` codes. */
export const REGISTRATION_TYPE_LABELS: Readonly<Record<string, string>> = {
	INDIVIDUAL: "บุคคลธรรมดา",
	JURISTIC_PERSON: "นิติบุคคล",
}
