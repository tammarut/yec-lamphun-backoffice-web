import { err, ok, Result } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/database/database-client"
import { inject, injectable } from "tsyringe"
import { IHealthRepository } from "./health.repository.interface"

@injectable()
export class HealthRepository implements IHealthRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	async getDatabaseTime(): Promise<Result<Date, DatabaseError>> {
		try {
			const sql = this.dbClient.getRwConnection()
			// Execute raw query using bun:sql tagged template literal
			const result = await sql`SELECT NOW() as now`
			const date = result[0]?.["now"] as Date
			return ok(date)
		} catch (error) {
			return err(new DatabaseError("Failed to get database time", error))
		}
	}
}
