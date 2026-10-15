import { describe, expect, test } from "vitest"
import { UuidV7Generator } from "./uuidv7-generator"

describe("UuidV7Generator", () => {
	describe("generate", () => {
		describe("Happy cases", () => {
			test("should return a valid UUID string", () => {
				// Arrange
				const generator = new UuidV7Generator()

				// Act
				const id = generator.generate()

				// Assert
				expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
			})

			test("should stamp version 7 and the RFC variant bits", () => {
				// Arrange
				const generator = new UuidV7Generator()

				// Act
				const id = generator.generate()

				// Assert
				expect(id[14]).toBe("7")
				expect(id[19]).toMatch(/[89ab]/)
			})

			test("should return unique ids across calls", () => {
				// Arrange
				const generator = new UuidV7Generator()

				// Act
				const ids = new Set(Array.from({ length: 100 }, () => generator.generate()))

				// Assert
				expect(ids.size).toBe(100)
			})

			test("should be time-ordered (lexicographic sort ≈ generation order)", () => {
				// Arrange
				const generator = new UuidV7Generator()

				// Act
				const first = generator.generate()
				const second = generator.generate()

				// Assert
				expect(second > first).toBe(true)
			})
		})
	})
})
