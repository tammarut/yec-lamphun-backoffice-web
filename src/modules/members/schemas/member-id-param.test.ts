import { describe, expect, test } from "vitest"

import { parseMemberIdParam } from "src/modules/members/schemas/member-id-param"

describe("parseMemberIdParam", () => {
	describe("Happy cases", () => {
		test("accepts canonical positive integer ids", () => {
			// Arrange / Act / Assert — pure parse contract
			expect(parseMemberIdParam("7")).toBe(7)
			expect(parseMemberIdParam("42")).toBe(42)
		})
	})

	describe("Unhappy cases", () => {
		test("rejects zero, signed, padded, and garbage segments", () => {
			// Arrange / Act / Assert
			expect(parseMemberIdParam("0")).toBeNull()
			expect(parseMemberIdParam("-5")).toBeNull()
			expect(parseMemberIdParam("007")).toBeNull()
			expect(parseMemberIdParam("7abc")).toBeNull()
			expect(parseMemberIdParam("abc")).toBeNull()
			expect(parseMemberIdParam(" 7")).toBeNull()
			expect(parseMemberIdParam("")).toBeNull()
		})

		test("rejects ids beyond the safe integer range", () => {
			// Arrange / Act / Assert
			expect(parseMemberIdParam("99999999999999999999")).toBeNull()
		})
	})
})
