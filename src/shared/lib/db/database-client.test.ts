import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Hoisted mock for "bun"
vi.mock("bun", () => {
	const instance = vi.fn(() => Promise.resolve([])) as unknown as { transaction: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>
	instance.transaction = vi.fn((callback) => callback(instance))

	class MockSQL {
		constructor(...args: unknown[]) {
			MockSQL.mockConstructor(...args)
			return instance
		}
		static mockConstructor = vi.fn()
	}

	return {
		sql: instance,
		SQL: MockSQL,
	}
})

// Mock envConfig
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
import { SQL, sql } from "bun"

describe("DatabaseClient", () => {
	let client: DatabaseClient
	let mockSqlInstance: ReturnType<typeof vi.fn> & { transaction: ReturnType<typeof vi.fn> }

	beforeEach(() => {
		vi.clearAllMocks()
		client = new DatabaseClient()
		mockSqlInstance = sql as unknown as typeof mockSqlInstance
	})

	describe("Happy cases", () => {
		it("should initialize Bun.SQL client with correct options", () => {
			expect((SQL as unknown as { mockConstructor: ReturnType<typeof vi.fn> }).mockConstructor).toHaveBeenCalledTimes(1)
			expect((SQL as unknown as { mockConstructor: ReturnType<typeof vi.fn> }).mockConstructor).toHaveBeenCalledWith({
				url: "postgres://mock:5432/db",
				max: 50,
				idleTimeout: 60,
				connectTimeout: 30,
				maxLifetime: 3600,
			})
		})

		it("should return Bun.SQL instance via getRwConnection()", () => {
			const sqlInstance = client.getRwConnection()
			expect(sqlInstance).toBeDefined()
			expect(sqlInstance).toBe(mockSqlInstance)
		})

		it("should verify connection successfully and return Ok", async () => {
			const result = await client.verifyConnection()

			expect(result.isOk()).toBe(true)
			expect(mockSqlInstance).toHaveBeenCalled()
		})

		it("should execute transaction and pass transaction object", async () => {
			const callback = vi.fn(async (tx: SQL) => {
				expect(tx).toBe(mockSqlInstance as unknown as SQL)
				return "tx-success"
			})

			const result = await client.transaction(callback)

			expect(result).toBe("tx-success")
			expect(mockSqlInstance.transaction).toHaveBeenCalledWith(callback)
			expect(callback).toHaveBeenCalledWith(mockSqlInstance)
		})
	})

	describe("Unhappy cases", () => {
		it("should return Err when verification fails", async () => {
			// Override implementation to throw
			mockSqlInstance.mockRejectedValueOnce(new Error("Connection failed"))

			const result = await client.verifyConnection()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr().message).toContain("Failed to verify database connection")
		})
	})
})
