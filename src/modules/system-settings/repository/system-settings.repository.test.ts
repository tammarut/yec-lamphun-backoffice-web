import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

// Mock the generated queries file BEFORE imports
vi.mock("src/shared/database/system-settings/sqlc-generated/queries_sql", () => ({
	getAllSettings: vi.fn(),
	updateSetting: vi.fn(),
}))

// Mock bun package BEFORE imports
vi.mock("bun", () => ({
	SQL: vi.fn(),
}))

import { DatabaseClient } from "src/shared/database/database-client"
import { SystemSettingsRepository } from "./system-settings.repository"
import { getAllSettings, updateSetting, type GetAllSettingsRow } from "src/shared/database/system-settings/sqlc-generated/queries_sql"
import { SQL } from "bun"

describe("SystemSettingsRepository", () => {
	let repository: SystemSettingsRepository
	let mockDbClient: MockProxy<DatabaseClient>
	let mockSql: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		mockDbClient = mock<DatabaseClient>()
		mockSql = vi.fn()
		mockDbClient.getRwConnection.mockReturnValue(mockSql as unknown as SQL)

		repository = new SystemSettingsRepository(mockDbClient)
	})

	describe("Happy cases", () => {
		it("should return all system settings mapped to camelCase", async () => {
			const mockRows: GetAllSettingsRow[] = [
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
			]

			vi.mocked(getAllSettings).mockResolvedValueOnce(mockRows)

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

			expect(getAllSettings).toHaveBeenCalledWith(mockSql)
		})

		it("should return empty array when no settings exist", async () => {
			vi.mocked(getAllSettings).mockResolvedValueOnce([])

			const result = await repository.getAllSettings()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([])
		})
	})

	describe("Unhappy cases", () => {
		it("should return DatabaseError when query fails", async () => {
			vi.mocked(getAllSettings).mockRejectedValueOnce(new Error("Connection refused"))

			const result = await repository.getAllSettings()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr().message).toBe("Connection refused")
			expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR")
		})
	})

	describe("updateSetting", () => {
		describe("Happy cases", () => {
			it("should update a system setting successfully", async () => {
				vi.mocked(updateSetting).mockResolvedValueOnce(undefined)

				const result = await repository.updateSetting("open_membership_renewal", false)

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toBeUndefined()
				expect(updateSetting).toHaveBeenCalledWith(mockSql, {
					feature: "open_membership_renewal",
					value: false,
				})
			})
		})

		describe("Unhappy cases", () => {
			it("should return DatabaseError when update setting query fails", async () => {
				vi.mocked(updateSetting).mockRejectedValueOnce(new Error("DB Connection Error"))

				const result = await repository.updateSetting("open_membership_renewal", false)

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr().message).toBe("DB Connection Error")
				expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR")
			})
		})
	})
})
