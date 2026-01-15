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
