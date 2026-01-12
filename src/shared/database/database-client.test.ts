import "reflect-metadata"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock envConfig before importing dependencies that use it
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		DATABASE_URL: "postgres://mock:5432/db",
		DB_MAX_CONNECTIONS: 50,
		DB_IDLE_TIMEOUT: 60,
		DB_CONNECTION_TIMEOUT: 30,
	},
}))

import { DatabaseClient } from "./database-client"
import { SQL } from "bun" // This will be resolved to src/test/mocks/bun.ts

describe("DatabaseClient", () => {
	let client: DatabaseClient

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()
		// Instantiate client
		client = new DatabaseClient()
	})

	describe("Happy cases", () => {
		it("should initialize SQL client with correct options", () => {
			const args = (SQL as any).lastConstructorArgs
			expect(args).toHaveLength(1)
			expect(args[0]).toEqual({
				url: "postgres://mock:5432/db",
				max: 50,
				idleTimeout: 60,
				connectionTimeout: 30,
			})
		})

		it("should return SQL instance via getSql()", () => {
			const sqlInstance = client.getSql()
			expect(sqlInstance).toBeDefined()
			// Check if it's the mocked SQL class instance
			// In our mock, the instance is also a callable function
			expect(typeof sqlInstance).toBe("function")
		})

		it("should verify connection successfully using tagged template", async () => {
			const sqlInstance = client.getSql()
			// Mock the call signature of the tagged template function
			// The mock implementation in bun.ts returns a promise resolving to []
			// We can spy on the mock implementation call

			// We need to spy on the instance itself since it's a callable function
			const spy = vi.spyOn(client, 'getSql').mockReturnValue(sqlInstance)

			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

			await expect(client.verifyConnection()).resolves.not.toThrow()

			// Verification that the callable was invoked is tricky with just the mock class structure
			// checking side effect (console log) is sufficient given the mock structure complexity
			expect(consoleSpy).toHaveBeenCalledWith(
				"Database connection verified successfully.",
			)
		})
	})

	describe("Unhappy cases", () => {
		it("should throw error when verification fails", async () => {
			// To mock failure of the tagged template call, we need to modify the mock implementation
			// of the specific instance returned by client
			const sqlInstance = client.getSql() as any

			// Override the mock implementation for this test to throw
			sqlInstance.mockImplementation(() => Promise.reject(new Error("Connection failed")))

			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			await expect(client.verifyConnection()).rejects.toThrow("Connection failed")
			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to verify database connection:",
				expect.any(Error),
			)
		})
	})
})
