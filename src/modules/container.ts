import "reflect-metadata"
import { AuthService } from "src/modules/auth/auth.service"
import { BusinessCategoriesRepository } from "src/modules/business-categories/repository/business-categories.repository"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"
import { MemberFileService } from "src/modules/members/member-file.service"
import { MemberFileUrlService } from "src/modules/members/member-file-url.service"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"
import { CreateNewMemberService } from "src/modules/members/use-case/create-new-member/create-new-member.service"
import { MembersRepository } from "src/modules/members/repository/members.repository"
import { AesGcmEncryptionService } from "src/modules/shared/crypto/aes-gcm-encryption.service"
import { HmacBlindIndexService } from "src/modules/shared/crypto/hmac-blind-index.service"
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
// R2StorageClient is the single R2 adapter: it implements BOTH IStorageClient
// (write) and IStorageUrlResolver (URL minting) over ONE S3Client connection
// pool (ADR-0007). Both interface tokens resolve to the same singleton instance
// — MEMBER_FILE_STORAGE_CLIENT owns it (useClass), STORAGE_URL_RESOLVER aliases
// to it (useToken) so neither service sees a second S3Client.
container.register(REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT, {
	useClass: R2StorageClient,
})

container.register(REGISTER_KEY.STORAGE_URL_RESOLVER, {
	useToken: REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT,
})

container.register(REGISTER_KEY.MEMBER_FILE_SERVICE, {
	useClass: MemberFileService,
})

container.register(REGISTER_KEY.MEMBER_FILE_URL_SERVICE, {
	useClass: MemberFileUrlService,
})

// 9. Register Shared PII Crypto Services
// Generic AES-256-GCM encryption and HMAC-SHA256 blind-index adapters, injected
// under interface tokens so tests can swap in mocks. Used by the members domain
// layer (IdCard); reusable for any future PII column.
container.register(REGISTER_KEY.ENCRYPTION_SERVICE, {
	useClass: AesGcmEncryptionService,
})

container.register(REGISTER_KEY.BLIND_INDEX_SERVICE, {
	useClass: HmacBlindIndexService,
})

// 10. Register Members Module (create-member flow)
// The repository wraps sqlc-generated queries; the service orchestrates member
// creation with crypto + position-cardinality checks. See docs/adr/0005-...
container.register(REGISTER_KEY.MEMBERS_REPOSITORY, {
	useClass: MembersRepository,
})

container.register(REGISTER_KEY.CREATE_NEW_MEMBER_SERVICE, {
	useClass: CreateNewMemberService,
})

// 10b. Register Members Module (get-member-by-id query) — ADR-0007/0008.
// Read-only orchestrator over the repository, crypto, and URL service.
container.register(REGISTER_KEY.GET_MEMBER_BY_ID_SERVICE, {
	useClass: GetMemberByIdService,
})

export { container }
