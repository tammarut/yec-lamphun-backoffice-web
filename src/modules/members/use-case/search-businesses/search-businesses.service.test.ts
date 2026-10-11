import { err, ok } from "neverthrow"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import type { IBusinessSearchRepository } from "../../repository/businesses/interfaces"
import type { BusinessSearchFilter, BusinessSearchItem } from "./search-businesses.types"
import { SearchBusinessesService } from "./search-businesses.service"

describe("SearchBusinessesService", () => {
	let service: SearchBusinessesService
	let mockRepository: MockProxy<IBusinessSearchRepository>

	beforeEach(() => {
		mockRepository = mock<IBusinessSearchRepository>()
		service = new SearchBusinessesService(mockRepository)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			it("should return items from repository unchanged", async () => {
				const mockItems: BusinessSearchItem[] = [
					{
						id: 1,
						name: "บริษัท ทดสอบ จำกัด",
						juristicRegistrationNo: "0123456789012",
						categoryName: "อุตสาหกรรมการผลิต",
						address: "ลำพูน",
						memberCount: 2,
						ownerNames: ["นายสมชาย ใจดี", "นางสมหญิง รักงาน"],
					},
					{
						id: 2,
						name: "หจก. ร้านค้าดี",
						juristicRegistrationNo: "0987654321098",
						categoryName: "เกษตร อาหาร และทรัพยากรชีวภาพ",
						address: null,
						memberCount: 0,
						ownerNames: [],
					},
				]

				mockRepository.searchLiveBusinesses.mockResolvedValue(ok(mockItems))

				const result = await service.execute({ limit: 50, search: null })

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toEqual(mockItems)
			})

			it("should pass the filter through to the repository", async () => {
				mockRepository.searchLiveBusinesses.mockResolvedValue(ok([]))

				const filter: BusinessSearchFilter = { limit: 10, search: "บริษัท" }
				const result = await service.execute(filter)

				expect(result.isOk()).toBe(true)
				expect(mockRepository.searchLiveBusinesses).toHaveBeenCalledWith(filter)
				expect(mockRepository.searchLiveBusinesses).toHaveBeenCalledTimes(1)
			})
		})

		describe("Unhappy cases", () => {
			it("should propagate database error", async () => {
				const dbError = new DatabaseError("Failed to search businesses")
				mockRepository.searchLiveBusinesses.mockResolvedValue(err(dbError))

				const result = await service.execute({ limit: 50, search: null })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toEqual(dbError)
			})
		})
	})
})
