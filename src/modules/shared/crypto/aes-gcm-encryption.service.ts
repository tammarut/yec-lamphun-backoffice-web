import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { inject, singleton } from "tsyringe"
import { CryptoError } from "./errors"
import type { IEncryptionService } from "./crypto-services.interface"

const IV_BYTES = 12 // GCM standard nonce length
const AUTH_TAG_BYTES = 16 // GCM authentication tag length

/**
 * AES-256-GCM encryption adapter.
 *
 * The 256-bit key is derived from `EnvConfig.ID_CARD_AES_KEY` — the env var is a
 * hex string (`openssl rand -hex 32`, 64 chars) that decodes to exactly 32 bytes.
 * Never imports the config singleton directly; takes {@link EnvConfig} via
 * injection so it stays testable with a synthetic key, mirroring R2StorageClient.
 *
 * One key per environment (see ADR on key strategy); zero-downtime rotation is
 * intentionally out of scope.
 */
@singleton()
export class AesGcmEncryptionService implements IEncryptionService {
	private readonly key: Buffer

	constructor(@inject(REGISTER_KEY.ENV_CONFIG) config: EnvConfig) {
		this.key = Buffer.from(config.ID_CARD_AES_KEY, "hex")
		if (this.key.length !== 32) {
			throw new Error(
				`ID_CARD_AES_KEY must decode to 32 bytes (256-bit), got ${this.key.length}. ` + "Store it as a hex-encoded 32-byte string (e.g. `openssl rand -hex 32`)."
			)
		}
	}

	encrypt(plaintext: string): Result<string, CryptoError> {
		try {
			const iv = randomBytes(IV_BYTES)
			const cipher = createCipheriv("aes-256-gcm", this.key, iv)
			const ciphertextBody = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
			const authTag = cipher.getAuthTag()
			return ok(Buffer.concat([iv, ciphertextBody, authTag]).toString("base64"))
		} catch (error) {
			return err(new CryptoError("AES-256-GCM encryption failed", error))
		}
	}

	decrypt(ciphertext: string): Result<string, CryptoError> {
		try {
			const blob = Buffer.from(ciphertext, "base64")
			// Layout: IV[12] || ciphertext || authTag[16]
			if (blob.length < IV_BYTES + AUTH_TAG_BYTES) {
				return err(new CryptoError("Ciphertext too short to contain IV and auth tag"))
			}
			const iv = blob.subarray(0, IV_BYTES)
			const authTag = blob.subarray(blob.length - AUTH_TAG_BYTES)
			const ciphertextBody = blob.subarray(IV_BYTES, blob.length - AUTH_TAG_BYTES)

			const decipher = createDecipheriv("aes-256-gcm", this.key, iv)
			decipher.setAuthTag(authTag)
			const plaintext = Buffer.concat([decipher.update(ciphertextBody), decipher.final()])
			return ok(plaintext.toString("utf8"))
		} catch (error) {
			return err(new CryptoError("AES-256-GCM decryption failed", error))
		}
	}
}
