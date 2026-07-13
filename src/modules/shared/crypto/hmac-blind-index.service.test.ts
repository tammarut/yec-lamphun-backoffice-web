// @vitest-environment node
import { createHmac, randomBytes } from "node:crypto"
import { describe, expect, test } from "vitest"
import type { EnvConfig } from "src/shared/config/env"
import { HmacBlindIndexService } from "./hmac-blind-index.service"

// Default HMAC key: a real 32-byte hex string (matches the production convention).
function makeConfig(hmacKey: string = randomBytes(32).toString("hex")): EnvConfig {
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
		ID_CARD_AES_KEY: "x".repeat(32),
		BLIND_INDEX_HMAC_KEY: hmacKey,
	}
}

describe("HmacBlindIndexService", () => {
	describe("Happy cases", () => {
		test("hash is deterministic for the same plaintext", () => {
			const service = new HmacBlindIndexService(makeConfig())
			const a = service.hash("1-2030-12345-67-8")
			const b = service.hash("1-2030-12345-67-8")
			if (!a.isOk() || !b.isOk()) {
				throw new Error("expected ok")
			}
			expect(a.value).toBe(b.value)
		})

		test("hash differs for different plaintexts", () => {
			const service = new HmacBlindIndexService(makeConfig())
			const a = service.hash("1-2030-12345-67-8")
			const b = service.hash("1-2030-12345-67-9")
			if (!a.isOk() || !b.isOk()) {
				throw new Error("expected ok")
			}
			expect(a.value).not.toBe(b.value)
		})

		test("hash matches an independent HMAC-SHA256 computation", () => {
			const key = randomBytes(32).toString("hex")
			const service = new HmacBlindIndexService(makeConfig(key))
			const result = service.hash("1-2030-12345-67-8")
			if (!result.isOk()) {
				throw new Error("expected ok")
			}

			const expected = createHmac("sha256", Buffer.from(key, "hex")).update("1-2030-12345-67-8", "utf8").digest("hex")
			expect(result.value).toBe(expected)
			expect(result.value).toHaveLength(64) // 32 bytes hex
		})
	})

	describe("Unhappy cases", () => {
		test("hashes with different keys differ", () => {
			const serviceA = new HmacBlindIndexService(makeConfig(randomBytes(32).toString("hex")))
			const serviceB = new HmacBlindIndexService(makeConfig(randomBytes(32).toString("hex")))
			const a = serviceA.hash("same-plaintext")
			const b = serviceB.hash("same-plaintext")
			if (!a.isOk() || !b.isOk()) {
				throw new Error("expected ok")
			}
			expect(a.value).not.toBe(b.value)
		})

		test("constructor throws if the HMAC key decodes to fewer than 32 bytes", () => {
			// 16 bytes = 32 hex chars — decodes under the 32-byte minimum.
			expect(() => new HmacBlindIndexService(makeConfig(randomBytes(16).toString("hex")))).toThrow()
		})
	})
})
