import "reflect-metadata"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Inline mock for "bun"
vi.mock("bun", () => {
	// Create a mock SQL class that is also callable (to simulate tagged templates)
	const MockSQL = class MockSQL extends Function {
		static lastConstructorArgs: any[] = []

		constructor(...args: any[]) {
			super()
			MockSQL.lastConstructorArgs = args

			// Simulate the tagged template behavior
			const callable = vi.fn().mockImplementation(() => Promise.resolve([]))
			Object.assign(callable, this)
			return callable
		}
	}

	return {
		SQL: MockSQL,
	}
})

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

describe("DatabaseClient", () => {
	let client: DatabaseClient

	beforeEach(() => {
		vi.clearAllMocks()
		client = new DatabaseClient()
	})

	describe("Happy cases", () => {
		it("should return SQL instance via getSql()", () => {
			const sqlInstance = client.getSql()
			expect(sqlInstance).toBeDefined()
			expect(typeof sqlInstance).toBe("function")
		})
	})
})
