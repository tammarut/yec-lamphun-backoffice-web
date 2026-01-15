import { SQL } from "bun"
import { singleton } from "tsyringe"
import { ok, err, Result } from "neverthrow"
import { envConfig } from "src/shared/config/env"
import { DatabaseError } from "src/shared/core/errors/app-error"

@singleton()
export class DatabaseClient {
	private rwConnection: SQL

	constructor() {
		// Initialize the Bun SQL client with the connection URL from environment variables.
		// The Bun SQL client manages the connection pool lazily.
		this.rwConnection = new SQL({
			adapter: "postgres",
			url: envConfig.DATABASE_URL,
			max: envConfig.DB_MAX_CONNECTIONS,
			idleTimeout: envConfig.DB_IDLE_TIMEOUT,
			connectionTimeout: envConfig.DB_CONNECTION_TIMEOUT,
			maxLifetime: envConfig.DB_MAX_LIFETIME,
		})
	}

	getRwConnection(): SQL {
		return this.rwConnection
	}

	async verifyConnection(): Promise<Result<void, DatabaseError>> {
		try {
			// Use tagged template literal for verification
			// We can use the instance itself as a function for tagged templates
			await this.rwConnection`SELECT 1`
			// Log removed to prevent blocking main thread
			return ok(undefined)
		} catch (error) {
			// Log removed to prevent blocking main thread
			return err(new DatabaseError("Failed to verify database connection", error))
		}
	}
}
