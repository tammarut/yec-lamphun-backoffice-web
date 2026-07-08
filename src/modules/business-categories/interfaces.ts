import { ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { BusinessCategoryDomain } from "./domain/business-category.domain"

export interface IBusinessCategoriesRepository {
	getBusinessCategories(): Promise<ResultAsync<readonly BusinessCategoryDomain[], DatabaseError>>
}
