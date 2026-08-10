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
	// Members module (update-member-by-id command) — ADR-0012.
	UPDATE_MEMBER_SERVICE: Symbol("UPDATE_MEMBER_SERVICE"),
	// Members module (delete-member-by-id command) — ADR-0013.
	DELETE_MEMBER_SERVICE: Symbol("DELETE_MEMBER_SERVICE"),
	// Membership-renewals module (create-renewal command) — ADR-0014. The renewals
	// repo owns the cross-table create transaction (INSERT renewal + UPDATE member
	// cache columns); the service runs the status pre-check.
	MEMBERSHIP_RENEWALS_REPOSITORY: Symbol("MEMBERSHIP_RENEWALS_REPOSITORY"),
	CREATE_RENEWAL_SERVICE: Symbol("CREATE_RENEWAL_SERVICE"),
	// Membership-renewals module (manual create-renewal command) — ADR-0016. A
	// staff-only sibling that reuses the same repo + pre-check but ALSO advances
	// the membership clock (expires_at + renewal_successful_count).
	CREATE_MANUAL_RENEWAL_SERVICE: Symbol("CREATE_MANUAL_RENEWAL_SERVICE"),
} as const
