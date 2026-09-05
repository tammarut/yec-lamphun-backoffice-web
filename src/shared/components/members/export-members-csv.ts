import { fullNameTh, positionLabel, statusBadgeLabel } from "src/shared/components/members/member-labels"
import type { MemberListItem } from "src/shared/components/members/members-types"

const CSV_HEADERS = ["ชื่อ-นามสกุล", "ชื่อเล่น", "ตำแหน่ง", "กิจการ", "เบอร์โทร", "อีเมล", "สถานะ"] as const

/** Quote-wrap a field and escape embedded quotes by doubling them. */
function csvEscape(value: string): string {
	return `"${value.replaceAll('"', '""')}"`
}

/**
 * Build the member-directory CSV (single string incl. the `\uFEFF` BOM so
 * Excel renders Thai). Columns and headers follow the card: name, nickname,
 * position label, business, phone, email, status badge label.
 */
export function buildMembersCsv(rows: readonly MemberListItem[]): string {
	const lines = [
		CSV_HEADERS.map(csvEscape).join(","),
		...rows.map((row) =>
			[fullNameTh(row), row.nickname ?? "", positionLabel(row.position), row.business.name, row.phone_no ?? "", row.email ?? "", statusBadgeLabel(row.status)]
				.map(csvEscape)
				.join(",")
		),
	]
	return `\uFEFF${lines.join("\n")}`
}

/**
 * Export rows as a downloaded CSV file (`yec_members_export.csv`, matching the
 * mockup). Callers decide the row set: selected members, or everything loaded.
 */
export function downloadMembersCsv(rows: readonly MemberListItem[]): void {
	const blob = new Blob([buildMembersCsv(rows)], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.setAttribute("download", "yec_members_export.csv")
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}
