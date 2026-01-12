import { sql } from "bun"
import { injectable } from "tsyringe"
import { ISqlClient } from "./sql-client.interface"

@injectable()
export class BunSqlClient implements ISqlClient {
	async query<T = any>(query: string, params: any[] = []): Promise<T[]> {
		// Use sql.unsafe to execute a raw query string with parameters.
		// This assumes the query string is trusted (from developer) and params are safely bound.
		// According to Bun docs: sql.unsafe(query, params)
		return (await sql.unsafe(query, params)) as T[]
	}
}
