import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

// Mock the generated queries file BEFORE imports
vi.mock("src/shared/database/business_categories/sqlc-generated/queries_sql", () => ({
	getBusinessCategories: vi.fn(),
}))

// Mock bun package BEFORE imports
vi.mock("bun", () => ({
	SQL: vi.fn(),
}))

import { DatabaseClient } from "src/shared/database/database-client"
import { BusinessCategoriesRepository } from "./business-categories.repository"
import { getBusinessCategories, type GetBusinessCategoriesRow } from "src/shared/database/business_categories/sqlc-generated/queries_sql"
import { SQL } from "bun"

describe("BusinessCategoriesRepository", () => {
	let repository: BusinessCategoriesRepository
	let mockDbClient: MockProxy<DatabaseClient>
	let mockSql: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		mockDbClient = mock<DatabaseClient>()
		mockSql = vi.fn()
		mockDbClient.getRwConnection.mockReturnValue(mockSql as unknown as SQL)

		repository = new BusinessCategoriesRepository(mockDbClient)
	})

	describe("Happy cases", () => {
		it("should return all business categories mapped to domain", async () => {
			const mockRows: GetBusinessCategoriesRow[] = [
				{ id: 1, name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
				{ id: 2, name: "อุตสาหกรรมการผลิต" },
			]

			vi.mocked(getBusinessCategories).mockResolvedValueOnce(mockRows)

			const result = await repository.getBusinessCategories()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([
				{ id: 1, name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
				{ id: 2, name: "อุตสาหกรรมการผลิต" },
			])

			expect(getBusinessCategories).toHaveBeenCalledWith(mockSql)
		})

		it("should return empty array when no categories exist", async () => {
			vi.mocked(getBusinessCategories).mockResolvedValueOnce([])

			const result = await repository.getBusinessCategories()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([])
		})
	})

	describe("Unhappy cases", () => {
		it("should return DatabaseError when query fails", async () => {
			vi.mocked(getBusinessCategories).mockRejectedValueOnce(new Error("Connection refused"))

			const result = await repository.getBusinessCategories()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr().message).toBe("Connection refused")
			expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR")
		})
	})
})
