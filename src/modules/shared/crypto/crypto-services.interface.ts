import type { Result } from "neverthrow"
import type { CryptoError } from "./errors"

/**
 * Generic field-level encryption seam (AES-256-GCM).
 *
 * Ciphertext format is base64( IV[12] || Ciphertext || AuthTag[16] ), matching
 * the `members.id_card_no` column comment. Synchronous: AES-GCM is CPU work,
 * not I/O, so callers get a plain Result rather than a Promise.
 *
 * Kept free of any member-domain vocabulary so other modules can reuse it for
 * any PII column. See docs/adr for the single-key-per-env decision.
 */
export interface IEncryptionService {
	/** Encrypt plaintext into base64(IV ‖ ciphertext ‖ authTag). */
	encrypt(plaintext: string): Result<string, CryptoError>
	/** Decrypt a value produced by {@link encrypt}. */
	decrypt(ciphertext: string): Result<string, CryptoError>
}

/**
 * Generic blind-index seam (HMAC-SHA256).
 *
 * Produces a deterministic 64-char hex digest usable as a blind index for
 * uniqueness and lookup without storing the plaintext. Reusable for any PII
 * column (id_card, email, phone).
 */
export interface IBlindIndexService {
	/** Hash plaintext into a stable 64-char hex blind index. */
	hash(plaintext: string): Result<string, CryptoError>
}
