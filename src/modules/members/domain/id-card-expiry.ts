import { err, ok, type Result } from "neverthrow"
import { MemberValidationError } from "./errors"

/**
 * Validate that the ID card has not already expired.
 *
 * This is a *semantic* business rule (time-dependent), so it lives in the
 * domain layer rather than the static Valibot schema at the route boundary.
 * Per the OpenAPI spec: "id_card_expiry_date must not < today".
 *
 * `today` is a parameter for deterministic tests. The comparison is
 * calendar-date based (NOT time-of-day): an expiry equal to today's date is
 * still valid — the card is valid through its expiry day.
 */
export function validateIdCardExpiry(expiryDate: Date, today: Date): Result<void, MemberValidationError> {
	const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
	const startOfExpiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate())

	if (startOfExpiry < startOfToday) {
		return err(new MemberValidationError("id_card_expiry_date must not be before today"))
	}

	return ok(undefined)
}
