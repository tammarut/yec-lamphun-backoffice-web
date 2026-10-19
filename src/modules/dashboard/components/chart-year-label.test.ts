import { describe, expect, test } from "vitest"

import { toBuddhistYearLabel } from "./chart-year-label"

describe("toBuddhistYearLabel", () => {
	describe("Happy cases", () => {
		test("should add 543 to a string year key from the API", () => {
			// Arrange
			const yearKey = "2026"

			// Act
			const label = toBuddhistYearLabel(yearKey)

			// Assert
			expect(label).toBe("2569")
		})

		test("should add 543 to a numeric year", () => {
			// Arrange
			const year = 2022

			// Act
			const label = toBuddhistYearLabel(year)

			// Assert
			expect(label).toBe("2565")
		})
	})

	describe("Unhappy cases", () => {
		test("should return the raw value for a non-numeric key", () => {
			// Arrange
			const yearKey = "unknown"

			// Act
			const label = toBuddhistYearLabel(yearKey)

			// Assert
			expect(label).toBe("unknown")
		})
	})
})
