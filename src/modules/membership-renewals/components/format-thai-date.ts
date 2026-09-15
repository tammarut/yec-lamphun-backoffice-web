/** Thai short-date display for an ISO timestamp (th-TH → Buddhist Era, e.g. "12 ส.ค. 2569"). */
export function formatThaiDate(isoDateTime: string): string {
	const date = new Date(isoDateTime)
	if (Number.isNaN(date.getTime())) {
		return "-"
	}
	return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
}
