import "reflect-metadata"
import { container } from "tsyringe"
import { envConfig } from "src/shared/config/env"
import { SessionStore } from "src/modules/shared/session-store/session-store"
import { ulidGenerator } from "src/shared/lib/ulid-generator"
import { DatabaseClient } from "src/shared/database/database-client"
import { HealthRepository } from "src/modules/health/health.repository"
import { HealthService } from "src/modules/health/health.service"

export const REGISTER_KEY = {
	ENV_CONFIG: Symbol("ENV_CONFIG"),
	SESSION_STORE: Symbol("SESSION_STORE"),
	DATABASE_CLIENT: Symbol("DATABASE_CLIENT"),
	HEALTH_REPOSITORY: Symbol("HEALTH_REPOSITORY"),
	HEALTH_SERVICE: Symbol("HEALTH_SERVICE"),
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

// 3. Register DatabaseClient
// We register the class constructor itself as the token to allow direct injection
container.register(DatabaseClient, {
	useClass: DatabaseClient,
})
// We also keep the symbol registration if other parts use it, or we can alias it.
// For now, I'll keep the symbol pointing to the same class to avoid breaking existing symbol usages immediately,
// but the plan says "update usage to resolve by class constructor".
container.register(REGISTER_KEY.DATABASE_CLIENT, {
	useToken: DatabaseClient,
})

// 4. Register Health Module
container.register(REGISTER_KEY.HEALTH_REPOSITORY, {
	useClass: HealthRepository,
})

container.register(REGISTER_KEY.HEALTH_SERVICE, {
	useClass: HealthService,
})

export { container }
