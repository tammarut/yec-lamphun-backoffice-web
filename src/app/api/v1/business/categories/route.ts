import { NextResponse } from "next/server"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { BusinessCategoryDomain } from "src/modules/business-categories/domain/business-category.domain"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"

export const dynamic = "force-dynamic"

function toBusinessCategoriesResponse(categories: readonly BusinessCategoryDomain[]): { business_categories: { id: number; category_name: string }[] } {
	return {
		business_categories: categories.map((category) => ({
			id: category.id,
			category_name: category.name,
		})),
	}
}

export async function GET() {
	const businessCategoriesService = container.resolve<BusinessCategoriesService>(REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE)
	const result = await businessCategoriesService.getBusinessCategories()

	if (result.isErr()) {
		console.error(result.error)
		return NextResponse.json({ message: "Internal Server Error" }, { status: 500 })
	}

	const responseBody = toBusinessCategoriesResponse(result.value)

	return NextResponse.json(responseBody)
}
