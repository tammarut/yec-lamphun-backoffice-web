import { err, ok, type Result } from "neverthrow"
import { MemberValidationError } from "./errors"

/** Thai national ID is always exactly 13 digits. */
const ID_CARD_LENGTH = 13
/** First N digits shown in plaintext. */
const HEAD_LENGTH = 3
/** Last N digits shown in plaintext. */
const TAIL_LENGTH = 4
/** The masked middle = everything between head and tail. Its length is derived
 *  (13 − 3 − 4 = 6 X's) so the three constants stay self-consistent if any change. */
const MASKED_MID = "X".repeat(ID_CARD_LENGTH - HEAD_LENGTH - TAIL_LENGTH)
const DIGITS_ONLY = /^\d+$/

/**
 * Mask a plaintext ID Card for display: first 3 + six "X" + last 4 digits
 * (e.g. "6329999914830" → "632XXXXXX4830"). See docs/adr/0008-... and the
 * Masked ID Card term in CONTEXT.md.
 *
 * Pure and deterministic so every read path (detail, list, export) shares one
 * definition. The input MUST be a valid 13-digit string — decryption of a
 * well-formed row always yields one; malformed input routes to `err` so the
 * caller can fall back to `null` + a server-side log (ADR-0008).
 */
export function maskIdCard(plaintext: string): Result<string, MemberValidationError> {
	if (plaintext.length !== ID_CARD_LENGTH || !DIGITS_ONLY.test(plaintext)) {
		return err(new MemberValidationError(`id_card_no plaintext must be ${ID_CARD_LENGTH} digits`))
	}

	const head = plaintext.slice(0, HEAD_LENGTH)
	const tail = plaintext.slice(ID_CARD_LENGTH - TAIL_LENGTH)

	return ok(`${head}${MASKED_MID}${tail}`)
}
