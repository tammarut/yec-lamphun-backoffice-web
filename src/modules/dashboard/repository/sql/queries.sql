-- ============================================================================
-- Dashboard module — sqlc queries for GET /api/v1/dashboard/stat (the
-- Dashboard Stat). Static aggregate reads over the members-owned tables
-- (members, member_business), each with the house `::int` casts so counts
-- arrive as JS numbers (BIGINT would arrive as a string). See ADR-0010/0019.
--
-- The dashboard module owns this block; the referenced schemas resolve in
-- sqlc.yaml ONLY so FKs parse — no TS cross-import into the members module
-- (symmetric mirror of the renewals block, ADR-0013 pattern).
-- ============================================================================

-- name: GetDashboardMemberStatusCounts :many
-- Single-row aggregate of the three member-status headline counts.
-- total_expired_members follows the dashboard spec LITERALLY —
-- status IN ('EXPIRED', 'PENDING_RENEWAL'), the "not yet renewed" reading —
-- deliberately a different definition from the Renewal Stat's same-named
-- field (ADR-0019; disambiguated in CONTEXT.md under Dashboard Stat).
-- RESIGNED members land in total_members but neither status bucket.
-- :many per ADR-0001; the repo narrows rows[0] with a zeros fallback.
SELECT
  COUNT(*)::int AS total_members,
  (COUNT(*) FILTER (WHERE status = 'ACTIVE'))::int AS total_active_members,
  (COUNT(*) FILTER (WHERE status IN ('EXPIRED', 'PENDING_RENEWAL')))::int AS total_expired_members
FROM members
WHERE deleted_at IS NULL;

-- name: CountDashboardBusinesses :many
-- Single-row count of non-deleted Member Businesses (at most one per member,
-- ADR-0005). :many per ADR-0001; the repo narrows rows[0] with a zeros
-- fallback.
SELECT COUNT(*)::int AS total_businesses
FROM member_business
WHERE deleted_at IS NULL;

-- name: GetDashboardMemberCountsByYear :many
-- Members joined per calendar year for the total_members_each_year breakdown.
-- Years are Bangkok wall-clock years: `AT TIME ZONE 'Asia/Bangkok'` converts
-- the TIMESTAMPTZ member_since to Thai local time BEFORE the EXTRACT, so year
-- boundaries do not depend on the DB session timezone (ADR-0019; the spec
-- pseudocode's bare EXTRACT would silently bucket by the session tz).
-- The service passes min_year = currentBangkokYear - lookback_years + 1 and
-- zero-fills the [min_year, current year] window — rows outside the window
-- are defensively ignored by the service, never expected here.
-- sqlc notes: the named `sqlc.arg(min_year)::int` form pins the param to int
-- (a bare $1 against the EXTRACT expression mis-infers as member_since's
-- Date), and GROUP BY 1 works where sqlc's analyzer rejects alias references
-- (no CTE/derived-table alias needed).
SELECT EXTRACT(YEAR FROM (member_since AT TIME ZONE 'Asia/Bangkok'))::int AS year, COUNT(*)::int AS count
FROM members
WHERE deleted_at IS NULL
  AND EXTRACT(YEAR FROM (member_since AT TIME ZONE 'Asia/Bangkok'))::int >= sqlc.arg(min_year)::int
GROUP BY 1
ORDER BY 1 ASC;
