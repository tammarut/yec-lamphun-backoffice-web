import "reflect-metadata"
import { container } from "tsyringe"
import { envConfig } from "src/shared/config/env"
import { SessionStore } from "src/modules/shared/session-store/session-store"
import { ulidGenerator } from "src/shared/lib/ulid-generator"
import { BunSqlClient } from "src/shared/database/bun-sql-client"

export const REGISTER_KEY = {
	ENV_CONFIG: Symbol("ENV_CONFIG"),
	SESSION_STORE: Symbol("SESSION_STORE"),
	SQL_CLIENT: Symbol("SQL_CLIENT"),
} as const

// 1. Register EnvConfig
container.register(REGISTER_KEY.ENV_CONFIG, {
	useValue: envConfig,
})

// 2. Initialize and Register SessionStore
// We create the instance here instead of in a separate file (formerly session-cache.ts)
const sessionStore = new SessionStore(86400, ulidGenerator) // 1 day TTL

container.register(REGISTER_KEY.SESSION_STORE, {
	useValue: sessionStore,
})

// 3. Register SqlClient
container.register(REGISTER_KEY.SQL_CLIENT, {
	useClass: BunSqlClient,
})

export { container }
