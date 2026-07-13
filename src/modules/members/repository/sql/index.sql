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
