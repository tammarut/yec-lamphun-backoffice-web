import "reflect-metadata"
import { AuthService } from "src/modules/auth/auth.service"
import { BusinessCategoriesService } from "src/modules/business-categories/business-categories.service"
import { BusinessCategoriesRepository } from "src/modules/business-categories/repository/business-categories.repository"
import { MemberFileUrlService } from "src/modules/members/member-file-url.service"
import { MemberFileService } from "src/modules/members/member-file.service"
import { MembersRepository } from "src/modules/members/repository/members.repository"
import { CreateNewMemberService } from "src/modules/members/use-case/create-new-member/create-new-member.service"
import { DeleteMemberService } from "src/modules/members/use-case/delete-member/delete-member.service"
import { GetLatestRenewalByMemberIdService } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.service"
import { GetListMembersService } from "src/modules/members/use-case/get-list-members/get-list-members.service"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"
import { UpdateMemberService } from "src/modules/members/use-case/update-member/update-member.service"
import { MembershipRenewalsRepository } from "src/modules/membership-renewals/repository/membership-renewals.repository"
import { CreateManualRenewalService } from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.service"
import { CreateRenewalService } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.service"
import { AesGcmEncryptionService } from "src/modules/shared/crypto/aes-gcm-encryption.service"
import { HmacBlindIndexService } from "src/modules/shared/crypto/hmac-blind-index.service"
import { SessionStore } from "src/modules/shared/session-store/session-store"
import { R2StorageClient } from "src/modules/shared/storage/r2-storage.client"
import { SystemSettingsRepository } from "src/modules/system-settings/repository/system-settings.repository"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { envConfig } from "src/shared/config/env"
import { ulidGenerator } from "src/shared/lib/ulid-generator"
import { container, Lifecycle } from "tsyringe"
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
// The `@singleton()` decorator on DatabaseClient already registers it under its
// own constructor as the token, which is what we want for direct injection via
// `@inject(DatabaseClient)`. A previous explicit `container.register(..., {
// useClass: DatabaseClient })` here was HARMFUL: without a `lifecycle` option,
// tsyringe's `register()` defaults to Transient, overwriting the decorator's
// Singleton registration. That made every `container.resolve(DatabaseClient)`
// construct a brand-new SQL connection pool (each `DB_MAX_CONNECTIONS=10`), and
// the pools were never closed — so every request leaked ~10 connections until
// Postgres rejected new ones with `53300: remaining connection slots are
// reserved for roles with the SUPERUSER attribute`. Removing the explicit
// registration lets the decorator's Singleton win: one DatabaseClient, one pool.

// 5. Register System Settings Module
container.register(REGISTER_KEY.SYSTEM_SETTINGS_REPOSITORY, {
	useClass: SystemSettingsRepository,
})

container.register(
	REGISTER_KEY.SYSTEM_SETTINGS_SERVICE,
	{
		useClass: SystemSettingsService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 6. Register Business Categories Module
container.register(REGISTER_KEY.BUSINESS_CATEGORIES_REPOSITORY, {
	useClass: BusinessCategoriesRepository,
})

container.register(
	REGISTER_KEY.BUSINESS_CATEGORIES_SERVICE,
	{
		useClass: BusinessCategoriesService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

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
// `lifecycle: Singleton` is REQUIRED: without it, tsyringe defaults `useClass`
// to Transient, and every resolve constructs a new R2StorageClient → new
// S3Client → new TCP connection pool (same class of bug as DatabaseClient).
container.register(
	REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT,
	{
		useClass: R2StorageClient,
	},
	{ lifecycle: Lifecycle.Singleton }
)

container.register(REGISTER_KEY.STORAGE_URL_RESOLVER, {
	useToken: REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT,
})

container.register(
	REGISTER_KEY.MEMBER_FILE_SERVICE,
	{
		useClass: MemberFileService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

container.register(
	REGISTER_KEY.MEMBER_FILE_URL_SERVICE,
	{
		useClass: MemberFileUrlService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 9. Register Shared PII Crypto Services
// Generic AES-256-GCM encryption and HMAC-SHA256 blind-index adapters, injected
// under interface tokens so tests can swap in mocks. Used by the members domain
// layer (IdCard); reusable for any future PII column.
// `lifecycle: Singleton` is REQUIRED: these derive crypto keys in their
// constructors — Transient would re-derive on every resolve.
container.register(
	REGISTER_KEY.ENCRYPTION_SERVICE,
	{
		useClass: AesGcmEncryptionService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

container.register(
	REGISTER_KEY.BLIND_INDEX_SERVICE,
	{
		useClass: HmacBlindIndexService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10. Register Members Module (create-member flow)
// The repository wraps sqlc-generated queries; the service orchestrates member
// creation with crypto + position-cardinality checks. See docs/adr/0005-...
container.register(REGISTER_KEY.MEMBERS_REPOSITORY, {
	useClass: MembersRepository,
})

container.register(
	REGISTER_KEY.CREATE_NEW_MEMBER_SERVICE,
	{
		useClass: CreateNewMemberService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10b. Register Members Module (get-member-by-id query) — ADR-0007/0008.
// Read-only orchestrator over the repository, crypto, and URL service.
container.register(
	REGISTER_KEY.GET_MEMBER_BY_ID_SERVICE,
	{
		useClass: GetMemberByIdService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10c. Register Members Module (get-list-members query) — ADR-0010/0011.
// Read-only orchestrator over the repository (Bun-SQL keyset pagination) and
// the URL service (profile_avatar public-bucket concat).
container.register(
	REGISTER_KEY.GET_LIST_MEMBERS_SERVICE,
	{
		useClass: GetListMembersService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10d. Register Members Module (get-latest-renewal-by-member-id query) —
// ADR-0007/0010/0013. Read-only orchestrator over the repository (composite
// member + business + latest renewal row) and the URL service (avatar public
// concat + slip presign). Serves GET /api/v1/membership/renewals/:member_id.
container.register(
	REGISTER_KEY.GET_LATEST_RENEWAL_BY_MEMBER_ID_SERVICE,
	{
		useClass: GetLatestRenewalByMemberIdService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10d. Register Members Module (update-member-by-id command) — ADR-0012.
// Orchestrator over the repository + crypto: existence check, sticky file-path
// resolution, conditional duplicate-id + position checks, transactional update.
container.register(
	REGISTER_KEY.UPDATE_MEMBER_SERVICE,
	{
		useClass: UpdateMemberService,
	},
	{ lifecycle: Lifecycle.Singleton }
)

// 10e. Register Members Module (delete-member-by-id command) — ADR-0013.
// Paper-thin DI/test seam over the repository's atomic cascade soft-delete
// transaction (member_documents → member_business → membership_renewals →
// members). No existence check, no crypto — idempotent 204 on any valid id.
container.register(REGISTER_KEY.DELETE_MEMBER_SERVICE, { useClass: DeleteMemberService }, { lifecycle: Lifecycle.Singleton })

// 10f. Register Membership-Renewals Module (create-renewal command) — ADR-0014.
// The renewals repo owns the cross-table create transaction: INSERT renewal +
// UPDATE member cache columns in one tx, catching pg 23505 on the INSERT. The
// service runs the member-status pre-check (404/403/409). The repository is
// Transient (stateless wrapper around the singleton DatabaseClient, matching
// MembersRepository); the service is Singleton (matching the other use cases).
container.register(REGISTER_KEY.MEMBERSHIP_RENEWALS_REPOSITORY, {
	useClass: MembershipRenewalsRepository,
})

container.register(REGISTER_KEY.CREATE_RENEWAL_SERVICE, { useClass: CreateRenewalService }, { lifecycle: Lifecycle.Singleton })

// 10g. Register the manual create-renewal service (ADR-0016). Reuses the same
// MEMBERSHIP_RENEWALS_REPOSITORY above (registered once); only this new service
// is registered. The manual service is a staff-only sibling: withAuth at the
// route proves staff, the service reuses the shared status pre-check, and its
// repo method advances the membership clock (expires_at + renewal_successful_count).
container.register(REGISTER_KEY.CREATE_MANUAL_RENEWAL_SERVICE, { useClass: CreateManualRenewalService }, { lifecycle: Lifecycle.Singleton })

export { container }
