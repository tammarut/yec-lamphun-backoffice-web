import "reflect-metadata"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock envConfig before importing dependencies that use it
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		DATABASE_URL: "postgres://mock:5432/db",
		DB_MAX_CONNECTIONS: 50,
		DB_IDLE_TIMEOUT: 60,
		// Mocking the default behavior of envConfig for DB_CONNECTION_TIMEOUT
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
			// Access the static lastConstructorArgs from the mocked class
			// We cast SQL to any because it's the class constructor itself
			const args = (SQL as any).lastConstructorArgs

			expect(args).toHaveLength(1)
			expect(args[0]).toEqual({
				url: "postgres://mock:5432/db",
				max: 50,
				idleTimeout: 60,
				connectionTimeout: 30,
			})
		})

		it("should execute query using sql.unsafe", async () => {
			const mockResult = [{ id: 1 }]
			// In our mock implementation (src/test/mocks/bun.ts), "client.sql" is an instance of the class MockSQL.
			// We can access the instance via the client property (although it is private, we can cast to any)
			const sqlInstance = (client as any).sql
			sqlInstance.unsafe.mockResolvedValue(mockResult)

			const result = await client.query("SELECT * FROM users WHERE id = $1", [1])

			expect(sqlInstance.unsafe).toHaveBeenCalledWith(
				"SELECT * FROM users WHERE id = $1",
				[1],
			)
			expect(result).toEqual(mockResult)
		})

		it("should verify connection successfully", async () => {
			const sqlInstance = (client as any).sql
			sqlInstance.unsafe.mockResolvedValue([{ 1: 1 }])
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

			await expect(client.verifyConnection()).resolves.not.toThrow()
			expect(sqlInstance.unsafe).toHaveBeenCalledWith("SELECT 1", [])
			expect(consoleSpy).toHaveBeenCalledWith(
				"Database connection verified successfully.",
			)
		})
	})

	describe("Unhappy cases", () => {
		it("should throw error when verification fails", async () => {
			const sqlInstance = (client as any).sql
			const mockError = new Error("Connection failed")
			sqlInstance.unsafe.mockRejectedValue(mockError)
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			await expect(client.verifyConnection()).rejects.toThrow("Connection failed")
			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to verify database connection:",
				mockError,
			)
		})
	})
})
