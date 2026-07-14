import { describe, expect, test } from "vitest"
import { shouldPositionConflict } from "./position-conflict-policy"

describe("shouldPositionConflict", () => {
	describe("SINGLE cardinality", () => {
		test("conflicts when an active holder already exists", () => {
			// Act
			const result = shouldPositionConflict("SINGLE", true)

			// Assert
			expect(result).toBe(true)
		})

		test("does NOT conflict when the position is vacant", () => {
			// Act
			const result = shouldPositionConflict("SINGLE", false)

			// Assert
			expect(result).toBe(false)
		})
	})

	describe("MULTIPLE cardinality", () => {
		test("never conflicts, even when holders exist (General Member, committees)", () => {
			// Act
			const result = shouldPositionConflict("MULTIPLE", true)

			// Assert
			expect(result).toBe(false)
		})

		test("does not conflict when vacant", () => {
			// Act
			const result = shouldPositionConflict("MULTIPLE", false)

			// Assert
			expect(result).toBe(false)
		})
	})
})
