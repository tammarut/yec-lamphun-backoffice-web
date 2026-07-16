// @vitest-environment node
import { createHmac, randomBytes } from "node:crypto"
import { describe, expect, test } from "vitest"
import type { EnvConfig } from "src/shared/config/env"
import { HmacBlindIndexService } from "./hmac-blind-index.service"

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
		ID_CARD_AES_KEY: randomBytes(32).toString("hex"),
		BLIND_INDEX_HMAC_KEY: hmacKey,
	}
}

describe("HmacBlindIndexService", () => {
	describe("Happy cases", () => {
		test("hash is deterministic for the same plaintext", () => {
			// Arrange
			const service = new HmacBlindIndexService(makeConfig())

			// Act
			const a = service.hash("1-2030-12345-67-8")._unsafeUnwrap()
			const b = service.hash("1-2030-12345-67-8")._unsafeUnwrap()

			// Assert
			expect(a).toBe(b)
		})

		test("hash differs for different plaintexts", () => {
			// Arrange
			const service = new HmacBlindIndexService(makeConfig())

			// Act
			const a = service.hash("1-2030-12345-67-8")._unsafeUnwrap()
			const b = service.hash("1-2030-12345-67-9")._unsafeUnwrap()

			// Assert
			expect(a).not.toBe(b)
		})

		test("hash matches an independent HMAC-SHA256 computation", () => {
			// Arrange
			const key = randomBytes(32).toString("hex")
			const service = new HmacBlindIndexService(makeConfig(key))

			// Act
			const result = service.hash("1-2030-12345-67-8")._unsafeUnwrap()

			// Assert
			const expected = createHmac("sha256", Buffer.from(key, "hex")).update("1-2030-12345-67-8", "utf8").digest("hex")
			expect(result).toBe(expected)
			expect(result).toHaveLength(64)
		})
	})

	describe("Unhappy cases", () => {
		test("hashes with different keys differ", () => {
			// Arrange
			const serviceA = new HmacBlindIndexService(makeConfig(randomBytes(32).toString("hex")))
			const serviceB = new HmacBlindIndexService(makeConfig(randomBytes(32).toString("hex")))

			// Act
			const a = serviceA.hash("same-plaintext")._unsafeUnwrap()
			const b = serviceB.hash("same-plaintext")._unsafeUnwrap()

			// Assert
			expect(a).not.toBe(b)
		})

		test("constructor throws if the HMAC key decodes to fewer than 32 bytes", () => {
			// Arrange — 16 bytes = 32 hex chars, under the 32-byte minimum
			const badConfig = makeConfig(randomBytes(16).toString("hex"))

			// Act + Assert
			expect(() => new HmacBlindIndexService(badConfig)).toThrow()
		})
	})
})
