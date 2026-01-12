export interface IDatabaseClient {
	/**
	 * Executes a SQL query with optional parameters.
	 * @param query The SQL query string.
	 * @param params Optional parameters to bind to the query.
	 * @returns A promise that resolves to an array of rows.
	 */
	query<T = any>(query: string, params?: any[]): Promise<T[]>

	/**
	 * Verifies the database connection by executing a simple query.
	 * Throws an error if the connection fails.
	 */
	verifyConnection(): Promise<void>
}
