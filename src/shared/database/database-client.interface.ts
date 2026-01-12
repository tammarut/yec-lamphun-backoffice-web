import { SQL } from "bun"

export interface IDatabaseClient {
	/**
	 * Returns the native Bun SQL instance.
	 * Usage:
	 * const sql = dbClient.getSql();
	 * const result = await sql`SELECT * FROM users`;
	 */
	getSql(): SQL

	/**
	 * Verifies the database connection by executing a simple query.
	 * Throws an error if the connection fails.
	 */
	verifyConnection(): Promise<void>
}
