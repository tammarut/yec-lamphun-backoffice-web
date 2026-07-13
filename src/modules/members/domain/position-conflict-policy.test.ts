import { describe, expect, test } from "vitest"
import { shouldPositionConflict } from "./position-conflict-policy"

describe("shouldPositionConflict", () => {
	describe("SINGLE cardinality", () => {
		test("conflicts when an active holder already exists", () => {
			expect(shouldPositionConflict("SINGLE", true)).toBe(true)
		})

		test("does NOT conflict when the position is vacant", () => {
			expect(shouldPositionConflict("SINGLE", false)).toBe(false)
		})
	})

	describe("MULTIPLE cardinality", () => {
		test("never conflicts, even when holders exist (General Member, committees)", () => {
			expect(shouldPositionConflict("MULTIPLE", true)).toBe(false)
		})

		test("does not conflict when vacant", () => {
			expect(shouldPositionConflict("MULTIPLE", false)).toBe(false)
		})
	})
})
