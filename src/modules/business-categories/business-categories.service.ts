import { ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import { REGISTER_KEY } from "../di-tokens"
import { BusinessCategoryDomain } from "./domain/business-category.domain"
import type { IBusinessCategoriesRepository } from "./interfaces"

@singleton()
export class BusinessCategoriesService {
	constructor(
		@inject(REGISTER_KEY.BUSINESS_CATEGORIES_REPOSITORY)
		private repository: IBusinessCategoriesRepository
	) {}

	async getBusinessCategories(): Promise<ResultAsync<readonly BusinessCategoryDomain[], DatabaseError>> {
		return this.repository.getBusinessCategories()
	}
}
