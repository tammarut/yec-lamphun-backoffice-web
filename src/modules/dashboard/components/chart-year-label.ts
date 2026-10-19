/**
 * Display-only Buddhist-Era label for a Dashboard Stat year key.
 *
 * `total_members_each_year` keys are Bangkok Gregorian calendar years
 * (JSON object string keys, e.g. "2026"); the chart's x-axis shows them in
 * Buddhist Era (year + 543, e.g. "2569") per the mockup. Pure arithmetic —
 * no locale, no Date.
 */
export function toBuddhistYearLabel(year: string | number): string {
	const gregorianYear = Number(year)
	if (!Number.isInteger(gregorianYear)) {
		return String(year)
	}
	return String(gregorianYear + 543)
}
