/**
 * Parses the `[member_id]` route segment. Canonical ids only — digits with no
 * sign, padding, or trailing garbage, within the safe integer range. Anything
 * else returns null so the page renders ไม่พบสมาชิก: `parseInt` alone would
 * turn "7abc" into member 7, and "0" / "-5" would reach the API as a 400
 * instead of a not-found.
 */
export function parseMemberIdParam(raw: string): number | null {
	if (!/^[1-9]\d*$/.test(raw)) {
		return null
	}
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isSafeInteger(parsed)) {
		return null
	}
	return parsed
}
