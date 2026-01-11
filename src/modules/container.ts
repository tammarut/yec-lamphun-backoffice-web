import "reflect-metadata"
import { container } from "tsyringe"
import { envConfig } from "src/shared/config/env"
import { SessionStore } from "src/shared/lib/session-store"
import { ulidGenerator } from "src/shared/lib/ulid-generator"

export const REGISTER_KEY = {
	ENV_CONFIG: Symbol("ENV_CONFIG"),
	SESSION_STORE: Symbol("SESSION_STORE"),
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

export { container }
