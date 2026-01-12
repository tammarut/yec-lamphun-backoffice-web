import { SQL } from "bun"
import { singleton } from "tsyringe"
import { envConfig } from "src/shared/config/env"
import { IDatabaseClient } from "./database-client.interface"

@singleton()
export class DatabaseClient implements IDatabaseClient {
	private sql: SQL

	constructor() {
		// Initialize the Bun SQL client with the connection URL from environment variables.
		// The Bun SQL client manages the connection pool lazily.
		this.sql = new SQL({
			url: envConfig.DATABASE_URL,
			max: envConfig.DB_MAX_CONNECTIONS,
			idleTimeout: envConfig.DB_IDLE_TIMEOUT,
			connectionTimeout: envConfig.DB_CONNECTION_TIMEOUT,
		})
	}

	async query<T = any>(query: string, params: any[] = []): Promise<T[]> {
		// Use sql.unsafe to execute a raw query string with parameters.
		// We use the instance method .unsafe() on the initialized client.
		return (await this.sql.unsafe(query, params)) as T[]
	}

	async verifyConnection(): Promise<void> {
		try {
			await this.query("SELECT 1")
			console.log("Database connection verified successfully.")
		} catch (error) {
			console.error("Failed to verify database connection:", error)
			throw error
		}
	}
}
