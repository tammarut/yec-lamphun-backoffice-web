// @vitest-environment node
import { randomBytes } from "node:crypto"
import { describe, expect, test } from "vitest"
import type { EnvConfig } from "src/shared/config/env"
import { AesGcmEncryptionService } from "./aes-gcm-encryption.service"

// Build a synthetic config with a real 32-byte hex AES key.
function makeConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
	return {
		NODE_ENV: "test",
		ADMIN_USERNAME: "admin",
		ADMIN_PASSWORD: "password",
		DATABASE_URL: "postgres://localhost/test",
		DB_MAX_CONNECTIONS: 10,
		DB_IDLE_TIMEOUT: 30,
		DB_CONNECTION_TIMEOUT: 30,
		DB_MAX_LIFETIME: 3600,
		R2_ACCOUNT_ID: "account",
		R2_ACCESS_KEY_ID: "key",
		R2_SECRET_ACCESS_KEY: "secret",
		R2_PUBLIC_BUCKET: "public",
		R2_PRIVATE_BUCKET: "private",
		ID_CARD_AES_KEY: randomBytes(32).toString("hex"),
		BLIND_INDEX_HMAC_KEY: randomBytes(32).toString("hex"),
		...overrides,
	}
}

describe("AesGcmEncryptionService", () => {
	describe("Happy cases", () => {
		test("encrypt → decrypt round-trips the plaintext", () => {
			// Arrange
			const service = new AesGcmEncryptionService(makeConfig())
			const plaintext = "1-2030-12345-67-8"

			// Act
			const ciphertext = service.encrypt(plaintext)._unsafeUnwrap()
			const decrypted = service.decrypt(ciphertext)._unsafeUnwrap()

			// Assert
			expect(decrypted).toBe(plaintext)
		})

		test("encrypt is non-deterministic (random IV per call)", () => {
			// Arrange
			const service = new AesGcmEncryptionService(makeConfig())
			const plaintext = "1-2030-12345-67-8"

			// Act
			const a = service.encrypt(plaintext)._unsafeUnwrap()
			const b = service.encrypt(plaintext)._unsafeUnwrap()
			const da = service.decrypt(a)._unsafeUnwrap()
			const db = service.decrypt(b)._unsafeUnwrap()

			// Assert
			expect(a).not.toBe(b)
			expect(da).toBe(plaintext)
			expect(db).toBe(plaintext)
		})

		test("ciphertext is base64 of IV[12] || body || tag[16]", () => {
			// Arrange
			const service = new AesGcmEncryptionService(makeConfig())

			// Act
			const ciphertext = service.encrypt("hello")._unsafeUnwrap()
			const blob = Buffer.from(ciphertext, "base64")

			// Assert — 12 IV + 5 plaintext bytes + 16 tag = 33
			expect(blob.length).toBe(12 + 5 + 16)
		})
	})

	describe("Unhappy cases", () => {
		test("decrypt with a tampered ciphertext fails (auth tag mismatch)", () => {
			// Arrange
			const service = new AesGcmEncryptionService(makeConfig())
			const ciphertext = service.encrypt("secret")._unsafeUnwrap()
			const blob = Buffer.from(ciphertext, "base64")
			blob[20] = blob[20]! ^ 0xff // flip a byte in the ciphertext body
			const tampered = blob.toString("base64")

			// Act
			const result = service.decrypt(tampered)

			// Assert
			expect(result.isErr()).toBe(true)
		})

		test("decrypt with a different key fails", () => {
			// Arrange
			const keyA = makeConfig()
			const keyB = makeConfig({ ID_CARD_AES_KEY: randomBytes(32).toString("hex") })
			const serviceA = new AesGcmEncryptionService(keyA)
			const serviceB = new AesGcmEncryptionService(keyB)
			const ciphertext = serviceA.encrypt("secret")._unsafeUnwrap()

			// Act
			const result = serviceB.decrypt(ciphertext)

			// Assert
			expect(result.isErr()).toBe(true)
		})

		test("decrypt rejects too-short ciphertext", () => {
			// Arrange
			const service = new AesGcmEncryptionService(makeConfig())
			const tooShort = Buffer.from("short").toString("base64")

			// Act
			const result = service.decrypt(tooShort)

			// Assert
			expect(result.isErr()).toBe(true)
		})

		test("constructor throws if the AES key is not 32 bytes", () => {
			// Arrange
			const badConfig = makeConfig({ ID_CARD_AES_KEY: randomBytes(16).toString("hex") })

			// Act + Assert
			expect(() => new AesGcmEncryptionService(badConfig)).toThrow()
		})
	})
})
