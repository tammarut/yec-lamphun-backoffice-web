import { err, ok, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/database/database-client"
import { getAllSettings, updateSetting } from "src/shared/database/system-settings/sqlc-generated/queries_sql"
import { inject, injectable } from "tsyringe"
import { SystemSettingDomain } from "../domain/system-setting.domain"
import { ISystemSettingsRepository } from "../interfaces"

@injectable()
export class SystemSettingsRepository implements ISystemSettingsRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	async getAllSettings(): Promise<ResultAsync<readonly SystemSettingDomain[], DatabaseError>> {
		const dbConn = this.dbClient.getRwConnection()

		const getAllSettingFunc = getAllSettings(dbConn as unknown as Sql)
		const result = await ResultAsync.fromPromise(getAllSettingFunc, (error) => error as Error)
		if (result.isErr()) {
			const error = result.error
			return err(new DatabaseError(error.message, error.cause))
		}

		const rows = result.value
		const settings: SystemSettingDomain[] = []
		for (const row of rows) {
			settings.push({
				feature: row.feature,
				value: row.value,
				description: row.description,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			})
		}

		return ok(settings)
	}

	async updateSetting(feature: string, value: unknown): Promise<ResultAsync<SystemSettingDomain, DatabaseError>> {
		const dbConn = this.dbClient.getRwConnection()

		const updateSettingFunc = updateSetting(dbConn as unknown as Sql, { feature, value: value as never })
		const result = await ResultAsync.fromPromise(updateSettingFunc, (error) => error as Error)

		if (result.isErr()) {
			const error = result.error
			return err(new DatabaseError(error.message, error.cause))
		}

		const row = result.value
		if (!row) {
			return err(new DatabaseError(`Failed to update setting: feature '${feature}' not found`))
		}

		return ok({
			feature: row.feature,
			value: row.value,
			description: row.description,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		})
	}
}
