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
	})
})
