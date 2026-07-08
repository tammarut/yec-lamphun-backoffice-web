import { err, ok } from "neverthrow"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { BusinessCategoryDomain } from "./domain/business-category.domain"
import { IBusinessCategoriesRepository } from "./interfaces"
import { BusinessCategoriesService } from "./business-categories.service"

describe("BusinessCategoriesService", () => {
	let service: BusinessCategoriesService
	let mockRepository: MockProxy<IBusinessCategoriesRepository>

	beforeEach(() => {
		mockRepository = mock<IBusinessCategoriesRepository>()
		service = new BusinessCategoriesService(mockRepository)
	})

	describe("getBusinessCategories", () => {
		it("should return categories from repository", async () => {
			const mockCategories: BusinessCategoryDomain[] = [
				{ id: 1, name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
				{ id: 2, name: "อุตสาหกรรมการผลิต" },
			]

			mockRepository.getBusinessCategories.mockResolvedValue(ok(mockCategories))

			const result = await service.getBusinessCategories()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual(mockCategories)
			expect(mockRepository.getBusinessCategories).toHaveBeenCalledTimes(1)
		})

		it("should propagate database error", async () => {
			const dbError = new DatabaseError("DB Error")
			mockRepository.getBusinessCategories.mockResolvedValue(err(dbError))

			const result = await service.getBusinessCategories()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toEqual(dbError)
		})
	})
})
