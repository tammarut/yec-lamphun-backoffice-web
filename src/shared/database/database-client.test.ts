import "reflect-metadata"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { SQL } from "bun"

// Mock envConfig before importing dependencies that use it
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		DATABASE_URL: "postgres://mock:5432/db",
		DB_MAX_CONNECTIONS: 50,
		DB_IDLE_TIMEOUT: 60,
		DB_CONNECTION_TIMEOUT: 30,
		DB_MAX_LIFETIME: 3600,
	},
}))

import { DatabaseClient } from "./database-client"

describe("DatabaseClient", () => {
	let client: DatabaseClient

	beforeEach(() => {
		vi.clearAllMocks()
		client = new DatabaseClient()
	})

	describe("Happy cases", () => {
		it("should initialize SQL client with correct options including adapter and maxLifetime", () => {
			// Access the static lastConstructorArgs from the mocked class (via src/test-setup.ts)
			const args = (SQL as any).lastConstructorArgs

			expect(args).toHaveLength(1)
			expect(args[0]).toEqual({
				adapter: "postgres",
				url: "postgres://mock:5432/db",
				max: 50,
				idleTimeout: 60,
				connectionTimeout: 30,
				maxLifetime: 3600,
			})
		})

		it("should return SQL instance via getSql()", () => {
			const sqlInstance = client.getSql()
			expect(sqlInstance).toBeDefined()
			expect(typeof sqlInstance).toBe("function")
		})

		it("should verify connection successfully and return Ok", async () => {
			const sqlInstance = client.getSql()
			// Mock successful query
			// We need to spy on the instance itself since it's a callable function
			const spy = vi.spyOn(client, "getSql").mockReturnValue(sqlInstance)
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

			const result = await client.verifyConnection()

			expect(result.isOk()).toBe(true)
			expect(consoleSpy).toHaveBeenCalledWith(
				"Database connection verified successfully.",
			)
		})
	})

	describe("Unhappy cases", () => {
		it("should return Err when verification fails", async () => {
			const sqlInstance = client.getSql() as any
			// Override the mock implementation for this test to throw
			sqlInstance.mockImplementation(() => Promise.reject(new Error("Connection failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const result = await client.verifyConnection()

			expect(result.isErr()).toBe(true)
			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to verify database connection:",
				expect.any(Error),
			)
		})
	})
})
