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
			const service = new AesGcmEncryptionService(makeConfig())
			const plaintext = "1-2030-12345-67-8"

			const enc = service.encrypt(plaintext)
			expect(enc.isOk()).toBe(true)
			if (!enc.isOk()) return

			const dec = service.decrypt(enc.value)
			expect(dec.isOk()).toBe(true)
			if (!dec.isOk()) return
			expect(dec.value).toBe(plaintext)
		})

		test("encrypt is non-deterministic (random IV per call)", () => {
			const service = new AesGcmEncryptionService(makeConfig())
			const plaintext = "1-2030-12345-67-8"

			const a = service.encrypt(plaintext)
			const b = service.encrypt(plaintext)
			if (!a.isOk() || !b.isOk()) {
				throw new Error("expected ok")
			}

			expect(a.value).not.toBe(b.value)

			// ...but both decrypt to the same plaintext
			const da = service.decrypt(a.value)
			const db = service.decrypt(b.value)
			if (!da.isOk() || !db.isOk()) {
				throw new Error("expected ok")
			}
			expect(da.value).toBe(plaintext)
			expect(db.value).toBe(plaintext)
		})

		test("ciphertext is base64 of IV[12] || body || tag[16]", () => {
			const service = new AesGcmEncryptionService(makeConfig())
			const enc = service.encrypt("hello")
			if (!enc.isOk()) {
				throw new Error("expected ok")
			}

			const blob = Buffer.from(enc.value, "base64")
			// 12 IV + (5 plaintext bytes) + 16 tag = 33
			expect(blob.length).toBe(12 + 5 + 16)
		})
	})

	describe("Unhappy cases", () => {
		test("decrypt with a tampered ciphertext fails (auth tag mismatch)", () => {
			const service = new AesGcmEncryptionService(makeConfig())
			const enc = service.encrypt("secret")
			if (!enc.isOk()) {
				throw new Error("expected ok")
			}

			// Flip a byte in the middle (ciphertext body, not the tag).
			const blob = Buffer.from(enc.value, "base64")
			blob[20] = blob[20]! ^ 0xff
			const tampered = blob.toString("base64")

			const dec = service.decrypt(tampered)
			expect(dec.isErr()).toBe(true)
		})

		test("decrypt with a different key fails", () => {
			const keyA = makeConfig()
			const keyB = makeConfig({ ID_CARD_AES_KEY: randomBytes(32).toString("hex") })
			const serviceA = new AesGcmEncryptionService(keyA)
			const serviceB = new AesGcmEncryptionService(keyB)

			const enc = serviceA.encrypt("secret")
			if (!enc.isOk()) {
				throw new Error("expected ok")
			}

			const dec = serviceB.decrypt(enc.value)
			expect(dec.isErr()).toBe(true)
		})

		test("decrypt rejects too-short ciphertext", () => {
			const service = new AesGcmEncryptionService(makeConfig())
			const dec = service.decrypt(Buffer.from("short").toString("base64"))
			expect(dec.isErr()).toBe(true)
		})

		test("constructor throws if the AES key is not 32 bytes", () => {
			expect(() => new AesGcmEncryptionService(makeConfig({ ID_CARD_AES_KEY: randomBytes(16).toString("hex") }))).toThrow()
		})
	})
})
