import { describe, expect, test, beforeEach } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { err, ok } from "neverthrow"
import { CryptoError, type IBlindIndexService, type IEncryptionService } from "src/modules/shared/crypto"
import { IdCard } from "./id-card"

describe("IdCard", () => {
	describe("fromPlaintext", () => {
		describe("Happy cases", () => {
			test("accepts a 13-digit plaintext", () => {
				const result = IdCard.fromPlaintext("1234567890123")
				expect(result.isOk()).toBe(true)
			})

			test("strips non-digit characters before validating", () => {
				const result = IdCard.fromPlaintext("1-2030-12345-67-8")
				expect(result.isOk()).toBe(true)
				if (!result.isOk()) return
				expect(result.value.value).toBe("1203012345678")
			})
		})

		describe("Unhappy cases", () => {
			test("rejects fewer than 13 digits", () => {
				const result = IdCard.fromPlaintext("123456789")
				expect(result.isErr()).toBe(true)
			})

			test("rejects more than 13 digits", () => {
				const result = IdCard.fromPlaintext("12345678901234")
				expect(result.isErr()).toBe(true)
			})

			test("rejects an empty string", () => {
				const result = IdCard.fromPlaintext("")
				expect(result.isErr()).toBe(true)
			})
		})
	})

	describe("toCipher", () => {
		let mockEncryption: MockProxy<IEncryptionService>
		let mockBlindIndex: MockProxy<IBlindIndexService>

		beforeEach(() => {
			mockEncryption = mock<IEncryptionService>()
			mockBlindIndex = mock<IBlindIndexService>()
		})

		describe("Happy cases", () => {
			test("delegates to both crypto services and returns the cipher form", () => {
				mockEncryption.encrypt.mockReturnValue(ok("enc-base64"))
				mockBlindIndex.hash.mockReturnValue(ok("hash-hex"))
				const id = IdCard.fromPlaintext("1234567890123")
				if (!id.isOk()) {
					throw new Error("expected ok")
				}

				const cipher = id.value.toCipher(mockEncryption, mockBlindIndex)
				if (!cipher.isOk()) {
					throw new Error("expected ok")
				}

				expect(cipher.value.idCardNo).toBe("enc-base64")
				expect(cipher.value.idCardNoHash).toBe("hash-hex")
				expect(mockEncryption.encrypt).toHaveBeenCalledWith("1234567890123")
				expect(mockBlindIndex.hash).toHaveBeenCalledWith("1234567890123")
			})
		})

		describe("Unhappy cases", () => {
			test("propagates encryption failure", () => {
				mockEncryption.encrypt.mockReturnValue(err(new CryptoError("boom")))
				mockBlindIndex.hash.mockReturnValue(ok("hash"))
				const id = IdCard.fromPlaintext("1234567890123")
				if (!id.isOk()) {
					throw new Error("expected ok")
				}

				const cipher = id.value.toCipher(mockEncryption, mockBlindIndex)
				expect(cipher.isErr()).toBe(true)
			})

			test("propagates blind-index failure", () => {
				mockEncryption.encrypt.mockReturnValue(ok("enc"))
				mockBlindIndex.hash.mockReturnValue(err(new CryptoError("boom")))
				const id = IdCard.fromPlaintext("1234567890123")
				if (!id.isOk()) {
					throw new Error("expected ok")
				}

				const cipher = id.value.toCipher(mockEncryption, mockBlindIndex)
				expect(cipher.isErr()).toBe(true)
			})
		})
	})
})
