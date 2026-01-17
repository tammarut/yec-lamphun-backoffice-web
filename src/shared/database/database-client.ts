import { err, ok, Result } from "neverthrow"
import postgres from "postgres"
import { envConfig } from "src/shared/config/env"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { singleton } from "tsyringe"

@singleton()
export class DatabaseClient {
	private rwConnection: postgres.Sql

	constructor() {
		// Initialize the postgres client with the connection URL from environment variables.
		// postgres.js manages the connection pool internally.
		this.rwConnection = postgres(envConfig.DATABASE_URL, {
			max: envConfig.DB_MAX_CONNECTIONS,
			idle_timeout: envConfig.DB_IDLE_TIMEOUT,
			connect_timeout: envConfig.DB_CONNECTION_TIMEOUT,
			max_lifetime: envConfig.DB_MAX_LIFETIME,
		})
	}

	getRwConnection(): postgres.Sql {
		return this.rwConnection
	}

	async verifyConnection(): Promise<Result<void, DatabaseError>> {
		try {
			// Use tagged template literal for verification
			// We can use the instance itself as a function for tagged templates
			await this.rwConnection`SELECT 1`
			return ok(undefined)
		} catch (error) {
			return err(new DatabaseError("Failed to verify database connection", error))
		}
	}
}
