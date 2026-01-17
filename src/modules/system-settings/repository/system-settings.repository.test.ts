import type { Sql } from "postgres"
import "reflect-metadata"
import { DatabaseClient } from "src/shared/database/database-client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { SystemSettingsRepository } from "./system-settings.repository"

describe("SystemSettingsRepository", () => {
	let repository: SystemSettingsRepository
	let mockDbClient: MockProxy<DatabaseClient>
	// The postgres.Sql type is complex (callable + properties), so we use a simple vi.fn()
	// The postgres.Sql type is complex (callable + properties), so we use a simple vi.fn()
	// and cast it to unknown/Sql for the test
	let mockSql: ReturnType<typeof vi.fn>

	beforeEach(() => {
		// 1. Create the mock DatabaseClient using vitest-mock-extended
		mockDbClient = mock<DatabaseClient>()

		// 2. Create the mock SQL function (tagged template handler)
		mockSql = vi.fn().mockResolvedValue([])

		// 3. Configure the mock client to return our mock SQL function
		// We cast mockSql because actual postgres.Sql type is complex
		// We cast mockSql because actual postgres.Sql type is complex
		mockDbClient.getRwConnection.mockReturnValue(mockSql as unknown as Sql)

		// 4. Instantiate repository with the mock client
		repository = new SystemSettingsRepository(mockDbClient)
	})

	describe("Happy cases", () => {
		it("should return all system settings mapped to camelCase", async () => {
			const mockRows = [
				{
					feature: "open_membership_renewal",
					value: true,
					description: "Controls if the membership renewal system is open to members.",
					created_at: new Date("2024-01-15T11:30:00+07:00"),
					updated_at: new Date("2024-01-15T11:30:00+07:00"),
				},
				{
					feature: "max_upload_size_mb",
					value: 10,
					description: "Maximum upload size in megabytes",
					created_at: new Date("2024-01-10T09:00:00+07:00"),
					updated_at: new Date("2024-01-12T14:30:00+07:00"),
				},
			]

			mockSql.mockResolvedValueOnce(mockRows)

			const result = await repository.getAllSettings()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([
				{
					feature: "open_membership_renewal",
					value: true,
					description: "Controls if the membership renewal system is open to members.",
					createdAt: new Date("2024-01-15T11:30:00+07:00"),
					updatedAt: new Date("2024-01-15T11:30:00+07:00"),
				},
				{
					feature: "max_upload_size_mb",
					value: 10,
					description: "Maximum upload size in megabytes",
					createdAt: new Date("2024-01-10T09:00:00+07:00"),
					updatedAt: new Date("2024-01-12T14:30:00+07:00"),
				},
			])
		})

		it("should return empty array when no settings exist", async () => {
			mockSql.mockResolvedValueOnce([])

			const result = await repository.getAllSettings()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([])
		})
	})

	describe("Unhappy cases", () => {
		it("should return DatabaseError when query fails", async () => {
			mockSql.mockRejectedValueOnce(new Error("Connection refused"))

			const result = await repository.getAllSettings()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr().message).toBe("Connection refused")
			expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR")
		})
	})
})
