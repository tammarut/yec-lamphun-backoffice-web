-- ============================================================================
-- members indexes
-- ============================================================================

-- Status / renewal-status filters (unchanged)
CREATE INDEX IF NOT EXISTS idx_members_status
    ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_latest_renewal_status
    ON members(latest_renewal_status);

-- Filter / join by position ("all VPs", supervisor derivation joins)
CREATE INDEX IF NOT EXISTS idx_members_position_code
    ON members(position_code);

-- Enforce uniqueness of the ID card without exposing the plaintext (unchanged)
CREATE UNIQUE INDEX IF NOT EXISTS members_id_card_hash_unique_idx
    ON members (id_card_no_hash);

-- NOTE: idx_members_parent_id is GONE — parent_id was dropped.

-- ============================================================================
-- positions indexes
-- ============================================================================

-- Hierarchy traversal (immediate-parent lookup + FK support)
CREATE INDEX IF NOT EXISTS idx_positions_parent_position_code
    ON positions(parent_position_code);

-- ============================================================================
-- Cardinality enforcement for SINGLE positions
-- ----------------------------------------------------------------------------
-- positions.cardinality = 'SINGLE' *declares* "one holder" but does not
-- *enforce* it. Emit one partial unique index per SINGLE position as part of
-- the admin "create position" flow (DDL inside a transaction is fine in PG).
-- DB-enforced and race-safe.
--
--   CREATE UNIQUE INDEX uniq_holder_<code>
--       ON members (position_code)
--       WHERE position_code = '<CODE>' AND deleted_at IS NULL;
--
-- Example (President — the canonical SINGLE role):
CREATE UNIQUE INDEX IF NOT EXISTS uniq_holder_president
    ON members (position_code)
    WHERE position_code = 'PRESIDENT' AND deleted_at IS NULL;

-- ============================================================================
-- Contact uniqueness among LIVE members only (PR #45, 2026-09)
-- ----------------------------------------------------------------------------
-- phone_no / email / line_id are unique per LIVE member; soft-deleting a
-- member (deleted_at set) drops its rows from these partial indexes,
-- releasing the values for a NEW member — a plain UNIQUE would block that
-- forever. NULLs never conflict (unique indexes treat NULL as distinct), so
-- the optional email / line_id columns need no special handling. The
-- services pre-check via FindLiveContactConflicts → 409 DUPLICATE_PHONE_NO /
-- DUPLICATE_EMAIL / DUPLICATE_LINE_ID (same technique as
-- idx_one_pending_renewal_per_member and uniq_holder_president above).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_members_phone_no_live
    ON members(phone_no)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_members_email_live
    ON members(email)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_members_line_id_live
    ON members(line_id)
    WHERE deleted_at IS NULL;
