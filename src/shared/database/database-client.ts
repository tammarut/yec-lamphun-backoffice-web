import { SQL } from "bun"
import { singleton } from "tsyringe"
import { envConfig } from "src/shared/config/env"

@singleton()
export class DatabaseClient {
	private sql: SQL

	constructor() {
		// Initialize the Bun SQL client with the connection URL from environment variables.
		// The Bun SQL client manages the connection pool lazily.
		this.sql = new SQL({
			adapter: "postgres",
			url: envConfig.DATABASE_URL,
			max: envConfig.DB_MAX_CONNECTIONS,
			idleTimeout: envConfig.DB_IDLE_TIMEOUT,
			connectionTimeout: envConfig.DB_CONNECTION_TIMEOUT,
			maxLifetime: envConfig.DB_MAX_LIFETIME,
		})
	}

	getSql(): SQL {
		return this.sql
	}

	async verifyConnection(): Promise<void> {
		try {
			// Use tagged template literal for verification
			// We can use the instance itself as a function for tagged templates
			await this.sql`SELECT 1`
			console.log("Database connection verified successfully.")
		} catch (error) {
			console.error("Failed to verify database connection:", error)
			throw error
		}
	}
}
