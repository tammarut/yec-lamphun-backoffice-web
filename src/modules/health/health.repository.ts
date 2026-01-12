import { injectable, inject } from "tsyringe"
import { REGISTER_KEY } from "src/modules/container"
import { IDatabaseClient } from "src/shared/database/database-client.interface"
import { IHealthRepository } from "./health.repository.interface"

@injectable()
export class HealthRepository implements IHealthRepository {
	constructor(
		@inject(REGISTER_KEY.DATABASE_CLIENT) private dbClient: IDatabaseClient,
	) {}

	async getDatabaseTime(): Promise<Date> {
		const sql = this.dbClient.getSql()
		// Execute a raw query using the tagged template literal syntax
		// Postgres returns current timestamp as a Date object in the result array
		// e.g. [{ now: 2023-10-27T... }]
		const result = await sql`SELECT NOW() as now`
		return result[0]?.now as Date
	}
}
