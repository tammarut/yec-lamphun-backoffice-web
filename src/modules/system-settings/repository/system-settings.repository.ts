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

	async getAllSettings(): Promise<ResultAsync<SystemSettingDomain[], DatabaseError>> {
		const dbConn = this.dbClient.getRwConnection()

		const result = await ResultAsync.fromPromise(getAllSettings(dbConn as unknown as Sql), (error) => error as Error)

		if (result.isErr()) {
			const error = result.error
			return err(new DatabaseError(error.message, error.cause))
		}

		const rows = result.value

		const settings: SystemSettingDomain[] = rows.map((row) => ({
			feature: row.feature,
			value: row.value,
			description: row.description,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}))

		return ok(settings)
	}

	async updateSetting(feature: string, value: unknown): Promise<ResultAsync<void, DatabaseError>> {
		const dbConn = this.dbClient.getRwConnection()

		const result = await ResultAsync.fromPromise(updateSetting(dbConn as unknown as Sql, { feature, value: value as never }), (error) => error as Error)

		if (result.isErr()) {
			const error = result.error
			return err(new DatabaseError(error.message, error.cause))
		}

		return ok()
	}
}
