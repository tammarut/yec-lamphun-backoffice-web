import "reflect-metadata"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock envConfig before importing dependencies that use it
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		DATABASE_URL: "postgres://mock:5432/db",
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
})
