import { err, ok, Result } from "neverthrow"
import { SQL } from "bun"
import { envConfig } from "src/shared/config/env"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { singleton } from "tsyringe"

@singleton()
export class DatabaseClient {
	private rwConnection: SQL

	constructor() {
		// Initialize the native bun:sql client with connection parameters.
		this.rwConnection = new SQL({
			url: envConfig.DATABASE_URL,
			max: envConfig.DB_MAX_CONNECTIONS,
			idleTimeout: envConfig.DB_IDLE_TIMEOUT,
			connectTimeout: envConfig.DB_CONNECTION_TIMEOUT,
			maxLifetime: envConfig.DB_MAX_LIFETIME,
		})
	}

	getRwConnection(): SQL {
		return this.rwConnection
	}

	/**
	 * Run queries inside a Bun.SQL transaction.
	 * If the callback succeeds, the transaction is automatically committed.
	 * If it throws an error, the transaction is rolled back.
	 */
	async transaction<T>(callback: (tx: SQL) => Promise<T>): Promise<T> {
		return await this.rwConnection.transaction(callback)
	}

	async verifyConnection(): Promise<Result<void, DatabaseError>> {
		try {
			// Tagged template verification using bun:sql
			await this.rwConnection`SELECT 1`
			return ok(undefined)
		} catch (error) {
			return err(new DatabaseError("Failed to verify database connection", error))
		}
	}
}
