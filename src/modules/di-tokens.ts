export const REGISTER_KEY = {
	ENV_CONFIG: Symbol("ENV_CONFIG"),
	SESSION_STORE: Symbol("SESSION_STORE"),
	ID_GENERATOR: Symbol("IIdGenerator"),
	AUTH_SERVICE: Symbol("AUTH_SERVICE"),
	SYSTEM_SETTINGS_REPOSITORY: Symbol("SYSTEM_SETTINGS_REPOSITORY"),
	SYSTEM_SETTINGS_SERVICE: Symbol("SYSTEM_SETTINGS_SERVICE"),
	BUSINESS_CATEGORIES_REPOSITORY: Symbol("BUSINESS_CATEGORIES_REPOSITORY"),
	BUSINESS_CATEGORIES_SERVICE: Symbol("BUSINESS_CATEGORIES_SERVICE"),
	MEMBER_FILE_STORAGE_CLIENT: Symbol("IStorageClient"),
	MEMBER_FILE_SERVICE: Symbol("MEMBER_FILE_SERVICE"),
	// Shared URL resolver (public-bucket concat + private-bucket presign) — ADR-0007.
	STORAGE_URL_RESOLVER: Symbol("IStorageUrlResolver"),
	// Member-side file-URL policy (field → bucket → URL method) — ADR-0007.
	MEMBER_FILE_URL_SERVICE: Symbol("MEMBER_FILE_URL_SERVICE"),
	// Shared PII crypto services — see src/modules/shared/crypto/
	ENCRYPTION_SERVICE: Symbol("IEncryptionService"),
	BLIND_INDEX_SERVICE: Symbol("IBlindIndexService"),
	// Members module (create-member flow) — see docs/adr/0005-...
	MEMBERS_REPOSITORY: Symbol("IMemberRepository"),
	CREATE_NEW_MEMBER_SERVICE: Symbol("CREATE_NEW_MEMBER_SERVICE"),
	// Members module (get-member-by-id query) — ADR-0007/0008.
	GET_MEMBER_BY_ID_SERVICE: Symbol("GET_MEMBER_BY_ID_SERVICE"),
	// Members module (get-list-members query) — ADR-0010/0011.
	GET_LIST_MEMBERS_SERVICE: Symbol("GET_LIST_MEMBERS_SERVICE"),
} as const
