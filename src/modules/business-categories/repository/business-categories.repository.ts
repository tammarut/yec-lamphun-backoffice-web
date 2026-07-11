import { err, ok, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { getBusinessCategories } from "src/modules/business-categories/repository/sql/sqlc-generated/queries_sql"
import { inject, injectable } from "tsyringe"
import { BusinessCategoryDomain } from "../domain/business-category.domain"
import { IBusinessCategoriesRepository } from "../interfaces"

@injectable()
export class BusinessCategoriesRepository implements IBusinessCategoriesRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	async getBusinessCategories(): Promise<ResultAsync<readonly BusinessCategoryDomain[], DatabaseError>> {
		const dbConn = this.dbClient.getRwConnection()

		const getBusinessCategoriesFunc = getBusinessCategories(dbConn as unknown as Sql)
		const result = await ResultAsync.fromPromise(getBusinessCategoriesFunc, (error) => error as Error)
		if (result.isErr()) {
			const error = result.error
			return err(new DatabaseError(error.message, error.cause))
		}

		const rows = result.value
		const categories: BusinessCategoryDomain[] = []
		for (const row of rows) {
			categories.push({
				id: row.id,
				name: row.name,
			})
		}

		return ok(categories)
	}
}
