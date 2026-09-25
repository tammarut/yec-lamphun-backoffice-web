/**
 * Bun.SQL → Postgres serialization helpers (ADR-0024: shared by the
 * per-table member-module repositories, which all talk to Bun SQL).
 *
 * Bun.SQL serializes JS values via toString(), which Postgres rejects for
 * several shapes; these helpers convert to the literal formats Postgres
 * accepts. All pass null through for nullable columns.
 */

/**
 * Convert a JS Date to a Postgres-safe ISO 8601 string.
 *
 * Bun.SQL serializes Date objects via Date.toString(), which produces a local-
 * timezone string like "2026-01-15 10:00:00 GMT+0700". Postgres does not
 * recognize the "GMT+0700" format and rejects it. Converting to ISO 8601
 * (UTC, "Z" suffix) makes Postgres accept it for both DATE and TIMESTAMPTZ
 * columns. Null passes through for nullable date columns.
 */
export function toPgDate(date: Date | null): string | null {
	if (date === null) {
		return null
	}

	return date.toISOString()
}

/**
 * Convert a JS array to a Postgres array literal string.
 *
 * Bun.SQL serializes JS arrays via Array.toString() → "100.5,13.7" (numbers)
 * or "ID_CARD,COMPANY_CERTIFICATE" (strings), which Postgres rejects as a
 * malformed array literal. The correct format is the Postgres array literal
 * "{100.5,13.7}" / "{ID_CARD,COMPANY_CERTIFICATE}". Null passes through for
 * nullable array columns.
 *
 * Used for numeric arrays (businesses.location) and text arrays (the
 * soft-delete member_documents type list). String elements are wrapped in
 * double quotes per the Postgres array-literal grammar so a value containing a
 * comma or brace would still parse correctly.
 */
export function toPgArray(arr: readonly (number | string)[] | null): string | null {
	if (arr === null) {
		return null
	}

	// Postgres array-literal grammar: strings are double-quoted; numbers are bare.
	// Double-quotes inside a string value are escaped by doubling (""). We
	// always quote strings (correct for identifiers that could need it; harmless
	// for plain values like 'ID_CARD').
	const elements = arr.map((el) => (typeof el === "number" ? String(el) : `"${String(el).replace(/"/g, '""')}"`))
	return `{${elements.join(",")}}`
}
