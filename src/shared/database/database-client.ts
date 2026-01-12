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
		this.sql = new SQL(envConfig.DATABASE_URL)
	}

	async query<T = any>(query: string, params: any[] = []): Promise<T[]> {
		// Use sql.unsafe to execute a raw query string with parameters.
		// We use the instance method .unsafe() on the initialized client.
		return (await this.sql.unsafe(query, params)) as T[]
	}
}
