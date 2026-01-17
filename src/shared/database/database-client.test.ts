import postgres from "postgres"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

// Mock postgres library
vi.mock("postgres", () => {
	// Create a mock function for the returned SQL instance (tagged template)
	const mockSqlInstance = vi.fn(() => Promise.resolve([]))

	// The default export is a factory function that returns the instance
	// We make it a spy so we can check constructor arguments
	const mockPostgresFactory = vi.fn(() => mockSqlInstance)

	return { default: mockPostgresFactory }
})

import { DatabaseClient } from "./database-client"

describe("DatabaseClient", () => {
	let client: DatabaseClient

	beforeEach(() => {
		vi.clearAllMocks()
		client = new DatabaseClient()
	})

	describe("Happy cases", () => {
		it("should initialize postgres client with correct options", () => {
			// Check if postgres factory was called with correct arguments
			expect(postgres).toHaveBeenCalledTimes(1)
			expect(postgres).toHaveBeenCalledWith("postgres://mock:5432/db", {
				max: 50,
				idle_timeout: 60,
				connect_timeout: 30, // Updated to match new option name
				max_lifetime: 3600,
			})
		})

		it("should return postgres SQL instance via getRwConnection()", () => {
			const sqlInstance = client.getRwConnection()
			expect(sqlInstance).toBeDefined()
			expect(typeof sqlInstance).toBe("function")
		})

		it("should verify connection successfully and return Ok", async () => {
			// The mock instance defaults to resolving Promise
			const result = await client.verifyConnection()

			expect(result.isOk()).toBe(true)
			// Verify that the SQL instance was called as a tagged template
			// In strict terms, tagged templates are called with an array of strings as first arg
			const sqlInstance = client.getRwConnection()
			expect(sqlInstance).toHaveBeenCalled()
		})
	})

	describe("Unhappy cases", () => {
		it("should return Err when verification fails", async () => {
			const sqlInstance = client.getRwConnection() as unknown as ReturnType<typeof vi.fn>
			// Override the mock implementation for this test to throw
			sqlInstance.mockImplementationOnce(() => Promise.reject(new Error("Connection failed")))

			const result = await client.verifyConnection()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr().message).toContain("Failed to verify database connection")
		})
	})
})
