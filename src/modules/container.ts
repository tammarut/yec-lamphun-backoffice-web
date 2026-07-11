import "reflect-metadata"
import { AuthService } from "src/modules/auth/auth.service"
import { BusinessCategoriesRepository } from "src/modules/business-categories/repository/business-categories.repository"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"
import { MemberFileService } from "src/modules/members/member-file.service"
import { R2StorageClient } from "src/modules/shared/storage/r2-storage.client"
import { SessionStore } from "src/modules/shared/session-store/session-store"
import { SystemSettingsRepository } from "src/modules/system-settings/repository/system-settings.repository"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { envConfig } from "src/shared/config/env"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { ulidGenerator } from "src/shared/lib/ulid-generator"
import { container } from "tsyringe"
import { REGISTER_KEY } from "./di-tokens"

export { REGISTER_KEY } from "./di-tokens"

// 1. Register EnvConfig
container.register(REGISTER_KEY.ENV_CONFIG, {
	useValue: envConfig,
})

// 2. Initialize and Register SessionStore
// We create the instance here instead of in a separate file (formerly session-cache.ts)
const sessionStore = new SessionStore(ulidGenerator)

container.register(REGISTER_KEY.SESSION_STORE, {
	useValue: sessionStore,
})

// Register the shared ID generator (ULID) so any service needing ULIDs can inject it.
container.register(REGISTER_KEY.ID_GENERATOR, {
	useValue: ulidGenerator,
})

// 3. Register DatabaseClient
// We register the class constructor itself as the token to allow direct injection
container.register(DatabaseClient, {
	useClass: DatabaseClient,
})

// 5. Register System Settings Module
container.register(REGISTER_KEY.SYSTEM_SETTINGS_REPOSITORY, {
	useClass: SystemSettingsRepository,
})

container.register(REGISTER_KEY.SYSTEM_SETTINGS_SERVICE, {
	useClass: SystemSettingsService,
})

// 6. Register Business Categories Module
container.register(REGISTER_KEY.BUSINESS_CATEGORIES_REPOSITORY, {
	useClass: BusinessCategoriesRepository,
})

container.register(REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE, {
	useClass: BusinessCategoriesService,
})

// 7. Register Auth Module
container.register(REGISTER_KEY.AUTH_SERVICE, {
	useClass: AuthService,
})

// 8. Register Members File Module
// The R2 storage client (shared infra adapter) is registered under an interface
// token so tests can swap in a mock; the member-file service depends on it.
container.register(REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT, {
	useClass: R2StorageClient,
})

container.register(REGISTER_KEY.MEMBER_FILE_SERVICE, {
	useClass: MemberFileService,
})

export { container }
