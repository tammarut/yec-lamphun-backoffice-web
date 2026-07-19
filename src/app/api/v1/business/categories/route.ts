import { NextResponse } from "next/server"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"
import { BusinessCategoryDomain } from "src/modules/business-categories/domain/business-category.domain"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { createLogger } from "src/shared/lib/logger/logger"
import { ResponseBodyError } from "src/app/api/shared/types"

export const dynamic = "force-dynamic"

const logger = createLogger(["business-categories", "route"])

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
		logger.error("business-categories fetch failed: {errorMessage} (code={code})", { code: result.error.code, errorMessage: result.error.message, cause: result.error.cause })
		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	const responseBody = toBusinessCategoriesResponse(result.value)

	return NextResponse.json(responseBody)
}
