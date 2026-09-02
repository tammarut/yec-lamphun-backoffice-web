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
	// Members module (get-latest-renewal-by-member-id query) — ADR-0007/0010/0013.
	// A member-centric read (member identity + business + newest renewal); the
	// members repo owns this first READ of membership_renewals (ADR-0013 was a write).
	GET_LATEST_RENEWAL_BY_MEMBER_ID_SERVICE: Symbol("GET_LATEST_RENEWAL_BY_MEMBER_ID_SERVICE"),
	// Members module (update-member-by-id command) — ADR-0012.
	UPDATE_MEMBER_SERVICE: Symbol("UPDATE_MEMBER_SERVICE"),
	// Members module (delete-member-by-id command) — ADR-0013.
	DELETE_MEMBER_SERVICE: Symbol("DELETE_MEMBER_SERVICE"),
	// Members module (get-executive-committee query) — ADR-0020. The org-chart
	// tree read: flat members+positions sqlc reads assembled into a tree DERIVED
	// from the position hierarchy, with Vacant Position placeholders for unheld
	// rungs. Reuses MEMBERS_REPOSITORY + MEMBER_FILE_URL_SERVICE.
	GET_EXECUTIVE_COMMITTEE_SERVICE: Symbol("GET_EXECUTIVE_COMMITTEE_SERVICE"),
	// Membership-renewals module (create-renewal command) — ADR-0014. The renewals
	// repo owns the cross-table create transaction (INSERT renewal + UPDATE member
	// cache columns); the service runs the status pre-check.
	MEMBERSHIP_RENEWALS_REPOSITORY: Symbol("MEMBERSHIP_RENEWALS_REPOSITORY"),
	CREATE_RENEWAL_SERVICE: Symbol("CREATE_RENEWAL_SERVICE"),
	// Membership-renewals module (manual create-renewal command) — ADR-0016. A
	// staff-only sibling that reuses the same repo + pre-check but ALSO advances
	// the membership clock (expires_at + renewal_successful_count).
	CREATE_MANUAL_RENEWAL_SERVICE: Symbol("CREATE_MANUAL_RENEWAL_SERVICE"),
	// Membership-renewals module (get-list-expired-membership query) — the
	// Expired Membership List for the backoffice renewal-review table. A
	// members-table-only read (grouping keys off the latest_renewal_status
	// cache column); the renewals repo owns it, and the service resolves avatar
	// URLs via the shared STORAGE_URL_RESOLVER (module boundary, grilling Q5).
	GET_LIST_EXPIRED_MEMBERSHIP_SERVICE: Symbol("GET_LIST_EXPIRED_MEMBERSHIP_SERVICE"),
	// Membership-renewals module (get-list-membership-renewal query) — the
	// Membership Renewal List (PENDING_REVIEW / APPROVED tabs of the same
	// review table). A LATERAL-join read into membership_renewals (renewal id +
	// payment date); set membership still keys off the latest_renewal_status
	// cache column. Same repo + shared STORAGE_URL_RESOLVER collaborators.
	GET_LIST_MEMBERSHIP_RENEWAL_SERVICE: Symbol("GET_LIST_MEMBERSHIP_RENEWAL_SERVICE"),
	// Membership-renewals module (get-renewal-stat query) — the Renewal Stat,
	// the three badge counts above the same review table. The repo's first
	// STATIC read (sqlc per ADR-0010): one COUNT(*) FILTER aggregate over the
	// Renewal Cache Columns, no join. Expired count includes latest-rejected
	// members per the spec (ADR-0017).
	GET_RENEWAL_STAT_SERVICE: Symbol("GET_RENEWAL_STAT_SERVICE"),
	// Membership-renewals module (review-renewal command) — ADR-0018. Staff
	// decide a live PENDING_REVIEW renewal: approve re-stamps expires_at and
	// bumps renewal_successful_count; reject expires the member with a reason.
	// Orchestrates the same MEMBERSHIP_RENEWALS_REPOSITORY (pre-check read +
	// guarded cross-table write); the transition rule lives on the aggregate.
	REVIEW_RENEWAL_SERVICE: Symbol("REVIEW_RENEWAL_SERVICE"),
	// Dashboard module (get-dashboard-stat query) — ADR-0019. The Dashboard
	// Stat: five headline counts read from the members-owned tables via the
	// dashboard repo's own sqlc block (spec-literal "not yet renewed" bucket;
	// Bangkok wall-clock years). No TS cross-import into the members module.
	DASHBOARD_REPOSITORY: Symbol("DASHBOARD_REPOSITORY"),
	GET_DASHBOARD_STAT_SERVICE: Symbol("GET_DASHBOARD_STAT_SERVICE"),
} as const
