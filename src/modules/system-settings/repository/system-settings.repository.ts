import { err, ok, ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/database/database-client"
import { inject, injectable } from "tsyringe"
import type { Sql } from "postgres"
import { SystemSettingDomain } from "../domain/system-setting.domain"
import { ISystemSettingsRepository } from "../interfaces"
import { getAllSettings } from "src/shared/database/system-settings/sqlc-generated/queries_sql"

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
}
