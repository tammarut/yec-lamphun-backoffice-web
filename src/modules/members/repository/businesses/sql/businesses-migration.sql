-- ============================================================================
-- Migration: extract `businesses` entity + `members.business_id` FK
-- Map ticket: https://github.com/tammarut/yec-lamphun-backoffice-web/issues/65
-- Run ONCE, manually:  psql -v ON_ERROR_STOP=1 -f businesses-migration.sql
-- One transaction: ANY failure rolls the whole thing back (PG DDL is tx-safe).
-- Before running:  pg_dump --table member_business --table members "$DATABASE_URL" \
--                    > pre-businesses-migration.dump
-- WHEN: only at the cutover ticket (#72) merge — the pre-cutover app still
--       queries member_business; running this earlier breaks it.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. businesses table — columns mirrored from member_business (minus member_id)
-- ----------------------------------------------------------------------------
CREATE TABLE businesses (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    -- Dedupe identity key (locked: exact match, live rows only)
    juristic_registration_no VARCHAR(50) NOT NULL,
    category_id SMALLINT NOT NULL,
    address TEXT,
    -- Location: [Longitude, Latitude], optional
    location DOUBLE PRECISION[] CHECK (cardinality(location) = 2),
    core_business TEXT,
    website TEXT,
    logo_file_path TEXT,
    product_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_businesses_category
        FOREIGN KEY (category_id) REFERENCES business_categories(id)
);

-- ----------------------------------------------------------------------------
-- 2. Backfill: one business per distinct juristic_registration_no, from ALL
--    member_business rows (live + soft-deleted).
--      · canonical row  = earliest created_at (original entry wins)
--      · logo/product   = first non-null across the group (COALESCE-style)
--      · zero live rows = seeded soft-deleted → "≥1 live member" invariant
--        holds from day one
-- ----------------------------------------------------------------------------
WITH merged AS (
    SELECT
        mb.juristic_registration_no,
        (ARRAY_AGG(mb.name              ORDER BY mb.created_at, mb.id))[1] AS name,
        (ARRAY_AGG(mb.description       ORDER BY mb.created_at, mb.id))[1] AS description,
        (ARRAY_AGG(mb.category_id       ORDER BY mb.created_at, mb.id))[1] AS category_id,
        (ARRAY_AGG(mb.address           ORDER BY mb.created_at, mb.id))[1] AS address,
        -- location is array-typed, which breaks the ARRAY_AGG route twice:
        -- plain [1] scalar-izes (ARRAY_AGG flattens sub-arrays into one 2-D
        -- array typed double precision[]) AND array-typed aggregates reject
        -- NULL inputs outright ("cannot accumulate null arrays"). Locked
        -- semantics = the canonical row supplies location, NULL stays NULL —
        -- so pick it straight off the canonical row instead.
        (SELECT mb2.location FROM member_business mb2
          WHERE mb2.juristic_registration_no = mb.juristic_registration_no
          ORDER BY mb2.created_at, mb2.id
          LIMIT 1) AS location,
        (ARRAY_AGG(mb.core_business     ORDER BY mb.created_at, mb.id))[1] AS core_business,
        (ARRAY_AGG(mb.website           ORDER BY mb.created_at, mb.id))[1] AS website,
        (ARRAY_AGG(mb.logo_file_path    ORDER BY mb.created_at, mb.id)
             FILTER (WHERE mb.logo_file_path    IS NOT NULL))[1] AS logo_file_path,
        (ARRAY_AGG(mb.product_file_path ORDER BY mb.created_at, mb.id)
             FILTER (WHERE mb.product_file_path IS NOT NULL))[1] AS product_file_path,
        (ARRAY_AGG(mb.created_at        ORDER BY mb.created_at, mb.id))[1] AS created_at,
        (ARRAY_AGG(mb.updated_at        ORDER BY mb.created_at, mb.id))[1] AS updated_at,
        COUNT(*) FILTER (WHERE mb.deleted_at IS NULL) AS live_rows
    FROM member_business mb
    GROUP BY mb.juristic_registration_no
)
INSERT INTO businesses (
    name, description, juristic_registration_no, category_id, address,
    location, core_business, website, logo_file_path, product_file_path,
    created_at, updated_at, deleted_at
)
SELECT
    name, description, juristic_registration_no, category_id, address,
    location, core_business, website, logo_file_path, product_file_path,
    created_at, updated_at,
    CASE WHEN live_rows = 0 THEN NOW() ELSE NULL END
FROM merged;

-- Sanity (info only): seeded rows must equal distinct juristic keys
SELECT (SELECT COUNT(*) FROM businesses)                                      AS seeded,
       (SELECT COUNT(DISTINCT juristic_registration_no) FROM member_business) AS expected;

-- ----------------------------------------------------------------------------
-- 3. members.business_id — add, backfill from each member's own row's group
-- ----------------------------------------------------------------------------
ALTER TABLE members ADD COLUMN business_id BIGINT;

UPDATE members m
SET business_id = b.id
FROM member_business mb
JOIN businesses b ON b.juristic_registration_no = mb.juristic_registration_no
WHERE mb.member_id = m.id;

-- Hard gate: any member without a business aborts the tx here
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM members WHERE business_id IS NULL) THEN
        RAISE EXCEPTION 'Backfill incomplete: members without a business remain';
    END IF;
END $$;

ALTER TABLE members ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE members
    ADD CONSTRAINT fk_members_business
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_members_business_id
    ON members (business_id);

-- ----------------------------------------------------------------------------
-- 4. businesses indexes (same statements belong in the module's index.sql)
--    Live-rows-only partial UNIQUE on the dedupe key — soft-deleted rows
--    release the juristic no so re-registration never gets blocked
--    (same house pattern as the member-contact uniques).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_juristic_registration_no
    ON businesses (juristic_registration_no)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at
    ON businesses (deleted_at);

-- ----------------------------------------------------------------------------
-- 5. Retire member_business — DROP (data fully migrated above; DDL preserved
--    in git history; the non-partial UNIQUE(member_id) landmine dies with it)
-- ----------------------------------------------------------------------------
DROP TABLE member_business;

COMMIT;

-- ============================================================================
-- Rollback story
--   · In-flight failure → automatic: single transaction, nothing persists.
--   · After COMMIT      → manual reverse (only if ever needed; dev DB):
--       ALTER TABLE members DROP CONSTRAINT fk_members_business;
--       ALTER TABLE members DROP COLUMN business_id;
--       DROP TABLE businesses;
--     …or restore pre-businesses-migration.dump wholesale.
-- ============================================================================
-- One-time manual post-checks after COMMIT (from #60):
--   · review the 2-name-variant group at juristic no 105557026729
--   · review the 4 personal-ID-shaped juristic_registration_no values
