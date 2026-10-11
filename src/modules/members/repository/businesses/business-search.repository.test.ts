import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

// Mock the generated queries file BEFORE imports
vi.mock("src/modules/members/repository/sql/sqlc-generated/queries_sql", () => ({
	searchLiveBusinesses: vi.fn(),
}))

// Mock bun package BEFORE imports
vi.mock("bun", () => ({
	SQL: vi.fn(),
}))

import type { SearchLiveBusinessesRow } from "src/modules/members/repository/sql/sqlc-generated/queries_sql"
import { searchLiveBusinesses } from "src/modules/members/repository/sql/sqlc-generated/queries_sql"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { SQL } from "bun"

import { BusinessSearchRepository } from "./business-search.repository"

describe("BusinessSearchRepository", () => {
	let repository: BusinessSearchRepository
	let mockDbClient: MockProxy<DatabaseClient>
	let mockSql: ReturnType<typeof vi.fn>

	function makeRow(overrides: Partial<SearchLiveBusinessesRow> = {}): SearchLiveBusinessesRow {
		return {
			id: "14",
			name: "V Foods",
			juristicRegistrationNo: "105557026729",
			categoryName: "อาหารและเครื่องดื่ม",
			address: null,
			memberCount: 2,
			// The generated type says `string` (sqlc has no array mapping), but
			// postgres.js parses the text[] column to `string[] | null` at
			// runtime — the repository casts at this boundary.
			ownerNames: null as unknown as string,
			...overrides,
		}
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockDbClient = mock<DatabaseClient>()
		mockSql = vi.fn()
		mockDbClient.getRwConnection.mockReturnValue(mockSql as unknown as SQL)

		repository = new BusinessSearchRepository(mockDbClient)
	})

	describe("searchLiveBusinesses", () => {
		describe("Happy cases", () => {
			it("passes a null search pattern through when search is null (no filter)", async () => {
				vi.mocked(searchLiveBusinesses).mockResolvedValueOnce([])

				const result = await repository.searchLiveBusinesses({ limit: 10, search: null })

				expect(result.isOk()).toBe(true)
				expect(searchLiveBusinesses).toHaveBeenLastCalledWith(mockSql, { searchPattern: null, rowLimit: 10 })
			})

			it.each([
				["plain input", "V Foods", "V Foods%"],
				["escapes %", "%", "\\%%"],
				["escapes _", "_", "\\_%"],
				["escapes the escape char itself", "\\", "\\\\%"],
				// trace: %_% → (\ pass) %_% → (% pass) \% \% … → \%\_% → (_ pass)
				// \%\_% → \\\_ → \%.\\._.\% → \%\\_\% → prefix % appended → \%\\_\%%
				["escapes mixed wildcards", "%_%", "\\%\\_\\%%"],
			])("builds the escaped prefix pattern — %s", async (_label, search, expectedPattern) => {
				vi.mocked(searchLiveBusinesses).mockResolvedValueOnce([])

				const result = await repository.searchLiveBusinesses({ limit: 10, search })

				expect(result.isOk()).toBe(true)
				expect(searchLiveBusinesses).toHaveBeenLastCalledWith(mockSql, { searchPattern: expectedPattern, rowLimit: 10 })
			})

			it("maps rows: BIGINT id string → number, driver text[] ownerNames passthrough", async () => {
				const rows = [makeRow({ ownerNames: ["นาย ประเสริฐ โชคดี", "นางสาว อรใจ ใจดี"] as unknown as string })]
				vi.mocked(searchLiveBusinesses).mockResolvedValueOnce(rows)

				const result = await repository.searchLiveBusinesses({ limit: 10, search: null })

				expect(result._unsafeUnwrap()).toEqual([
					{
						id: 14,
						name: "V Foods",
						juristicRegistrationNo: "105557026729",
						categoryName: "อาหารและเครื่องดื่ม",
						address: null,
						memberCount: 2,
						ownerNames: ["นาย ประเสริฐ โชคดี", "นางสาว อรใจ ใจดี"],
					},
				])
			})

			it("maps a null owner_names rollup (no live linked members) to an empty array", async () => {
				const rows = [makeRow({ ownerNames: null as unknown as string })]
				vi.mocked(searchLiveBusinesses).mockResolvedValueOnce(rows)

				const result = await repository.searchLiveBusinesses({ limit: 10, search: null })

				expect(result._unsafeUnwrap()[0]?.ownerNames).toEqual([])
			})
		})

		describe("Unhappy cases", () => {
			it("wraps a query failure as DatabaseError", async () => {
				vi.mocked(searchLiveBusinesses).mockRejectedValueOnce(new Error("Connection refused"))

				const result = await repository.searchLiveBusinesses({ limit: 10, search: "V Foods" })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr().message).toBe("Failed to search businesses")
				expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR")
			})
		})
	})
})
