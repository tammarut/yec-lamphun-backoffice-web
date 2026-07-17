import { describe, expect, test } from "vitest"
import { maskIdCard } from "./mask-id-card"

describe("maskIdCard", () => {
	describe("Happy cases", () => {
		test("masks a 13-digit ID as first3 + XXXXXX + last4", () => {
			// "6329999914830": head=632, tail (last 4)=4830 → "632XXXXXX4830".
			expect(maskIdCard("6329999914830")._unsafeUnwrap()).toBe("632XXXXXX4830")
		})

		test("masks 1100600214063 to 110XXXXXX4063", () => {
			expect(maskIdCard("1100600214063")._unsafeUnwrap()).toBe("110XXXXXX4063")
		})

		test("preserves all 13 chars (never truncates)", () => {
			const masked = maskIdCard("1234567890123")._unsafeUnwrap()
			expect(masked).toHaveLength(13)
			expect(masked).toBe("123XXXXXX0123")
		})

		test("the masked form matches the spec's example shape 632XXXXXX1483", () => {
			// Spec example output is "632XXXXXX1483"; input head=632, last-4=1483.
			expect(maskIdCard("6320000011483")._unsafeUnwrap()).toBe("632XXXXXX1483")
		})
	})

	describe("Unhappy cases", () => {
		test("rejects an input shorter than 13 digits", () => {
			expect(maskIdCard("12345").isErr()).toBe(true)
		})

		test("rejects an input with non-digit characters", () => {
			expect(maskIdCard("123456789012A").isErr()).toBe(true)
		})

		test("rejects an input longer than 13 digits", () => {
			expect(maskIdCard("12345678901234").isErr()).toBe(true)
		})

		test("rejects an empty string", () => {
			expect(maskIdCard("").isErr()).toBe(true)
		})
	})
})
