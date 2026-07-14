import { err, ok, type Result } from "neverthrow"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { CryptoError } from "src/modules/shared/crypto"
import { MemberValidationError } from "./errors"

/** The encrypted + hashed representation ready for persistence. */
export interface IdCardCipher {
	/** AES-256-GCM ciphertext, base64(IV ‖ ciphertext ‖ authTag). */
	readonly idCardNo: string
	/** HMAC-SHA256 hex blind index (64 chars). */
	readonly idCardNoHash: string
}

/**
 * Pure value object for a member's ID card number.
 *
 * Knows nothing about HTTP or the database. It validates the plaintext, then
 * delegates the cryptographic transform to two injected services — keeping the
 * AES/HMAC details swappable and the domain logic testable with stubs.
 *
 * The validate/encrypt/hash steps are split deliberately: validation is
 * synchronous and pure; encryption is delegated to {@link IEncryptionService};
 * hashing to {@link IBlindIndexService}. The service orchestrates them in the
 * order the OpenAPI spec prescribes (validate → encrypt → hash).
 */
export class IdCard {
	private constructor(private readonly plaintext: string) {}

	/**
	 * Construct an IdCard after validating the plaintext format.
	 * Thai national ID: 13 digits (the spec's example uses dashes, which we strip).
	 */
	static fromPlaintext(plaintext: string): Result<IdCard, MemberValidationError> {
		const digits = plaintext.replace(/\D/g, "")
		if (digits.length !== 13) {
			return err(new MemberValidationError("id_card_no must contain exactly 13 digits"))
		}

		return ok(new IdCard(digits))
	}

	/** The validated plaintext (digits only). Exposed for hashing/encryption. */
	get value(): string {
		return this.plaintext
	}

	/**
	 * Encrypt + hash into the persisted cipher form. Returns the two columns
	 * exactly as they should be written to `members`.
	 */
	toCipher(encryption: IEncryptionService, blindIndex: IBlindIndexService): Result<IdCardCipher, CryptoError> {
		const enc = encryption.encrypt(this.plaintext)
		if (enc.isErr()) {
			return err(enc.error)
		}

		const hash = blindIndex.hash(this.plaintext)
		if (hash.isErr()) {
			return err(hash.error)
		}

		return ok({ idCardNo: enc.value, idCardNoHash: hash.value })
	}
}
