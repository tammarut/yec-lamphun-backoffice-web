/**
 * Thai short-date display for an ISO date/datetime (renewal tables / review
 * dialog / member detail). Date-only inputs (YYYY-MM-DD) are spec-parsed as
 * UTC midnight, which renders the PREVIOUS day in negative-offset locales —
 * pin them to local midnight so the calendar day is locale-independent.
 */
export function formatThaiDate(isoDateTime: string): string {
	const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoDateTime) ? `${isoDateTime}T00:00:00` : isoDateTime
	const date = new Date(normalized)
	if (Number.isNaN(date.getTime())) {
		return "-"
	}
	return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
}
