import { describe, expect, test } from "vitest"
import { validateIdCardExpiry } from "./id-card-expiry"

describe("validateIdCardExpiry", () => {
	describe("Happy cases", () => {
		test("accepts an expiry date in the future", () => {
			// Arrange
			const today = new Date(2026, 6, 13) // 2026-07-13
			const expiry = new Date(2027, 7, 19) // 2027-08-19

			// Act
			const result = validateIdCardExpiry(expiry, today)

			// Assert
			expect(result.isOk()).toBe(true)
		})

		test("accepts an expiry date equal to today (valid through expiry day)", () => {
			// Arrange
			const today = new Date(2026, 6, 13)
			const expiry = new Date(2026, 6, 13)

			// Act
			const result = validateIdCardExpiry(expiry, today)

			// Assert
			expect(result.isOk()).toBe(true)
		})

		test("compares by calendar date, not time-of-day", () => {
			// Arrange — today at 23:59, expiry same day at 00:00 → equal-by-date, valid
			const today = new Date(2026, 6, 13, 23, 59, 0)
			const expiry = new Date(2026, 6, 13, 0, 0, 0)

			// Act
			const result = validateIdCardExpiry(expiry, today)

			// Assert
			expect(result.isOk()).toBe(true)
		})
	})

	describe("Unhappy cases", () => {
		test("rejects an expiry date before today", () => {
			// Arrange
			const today = new Date(2026, 6, 13)
			const expiry = new Date(2026, 6, 12) // yesterday

			// Act
			const result = validateIdCardExpiry(expiry, today)

			// Assert
			expect(result.isErr()).toBe(true)
		})

		test("rejects an expiry date well in the past", () => {
			// Arrange
			const today = new Date(2026, 6, 13)
			const expiry = new Date(2020, 0, 1)

			// Act
			const result = validateIdCardExpiry(expiry, today)

			// Assert
			expect(result.isErr()).toBe(true)
		})
	})
})
