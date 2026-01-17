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
			// Execute a raw query using the tagged template literal syntax
			// Postgres returns current timestamp as a Date object in the result array
			// e.g. [{ now: 2023-10-27T... }]
			const result = await sql`SELECT NOW() as now`
			const date = result[0]?.["now"] as Date
			return ok(date)
		} catch (error) {
			return err(new DatabaseError("Failed to get database time", error))
		}
	}
}
