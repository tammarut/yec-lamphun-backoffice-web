import { err, ok } from "neverthrow"
import { NextResponse } from "next/server"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Mock the logger wrapper so route code's logger.error calls don't leak into
// test output. Matches the canonical route-test pattern (mock the seam, not
// the underlying library). See docs/adr/0009.
vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { BusinessCategoryDomain } from "src/modules/business-categories/domain/business-category.domain"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"

// Import route AFTER mocks
import { GET } from "./route"

describe("GET /api/v1/business/categories", () => {
	let mockService: ReturnType<typeof mock<BusinessCategoriesService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<BusinessCategoriesService>()
		vi.mocked(container.resolve).mockReturnValue(mockService)
	})

	it("should return 200 and mapped business categories", async () => {
		const mockCategories: BusinessCategoryDomain[] = [
			{ id: 1, name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
			{ id: 2, name: "อุตสาหกรรมการผลิต" },
		]

		mockService.getBusinessCategories.mockResolvedValue(ok(mockCategories))

		const response = await GET()

		expect(response).toBeInstanceOf(NextResponse)
		expect(response.status).toBe(200)

		const json = await response.json()
		expect(json).toEqual({
			business_categories: [
				{ id: 1, category_name: "เกษตร อาหาร และทรัพยากรชีวภาพ" },
				{ id: 2, category_name: "อุตสาหกรรมการผลิต" },
			],
		})
		expect(mockService.getBusinessCategories).toHaveBeenCalledTimes(1)
		expect(container.resolve).toHaveBeenCalledWith(REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE)
	})

	it("should return 200 with empty array when no categories exist", async () => {
		mockService.getBusinessCategories.mockResolvedValue(ok([]))

		const response = await GET()

		expect(response.status).toBe(200)
		const json = await response.json()
		expect(json).toEqual({ business_categories: [] })
	})

	it("should return 500 when service returns error", async () => {
		mockService.getBusinessCategories.mockResolvedValue(err(new DatabaseError("DB Error")))

		const response = await GET()

		expect(response.status).toBe(500)
		const json = await response.json()
		expect(json).toEqual({ message: "Internal Server Error" })
	})
})
