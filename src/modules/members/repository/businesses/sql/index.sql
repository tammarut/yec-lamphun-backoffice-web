-- ============================================================================
-- businesses indexes
-- (same statements as the applied #72 cutover — runbook archived in git history)
-- ============================================================================

-- Live-rows-only partial UNIQUE on the dedupe identity key — soft-deleting a
-- business drops its row from the partial index, releasing the juristic
-- registration no so re-registration never gets blocked (same house pattern
-- as the member-contact uniques, PR #45).
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_juristic_registration_no
    ON businesses (juristic_registration_no)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_deleted_at
    ON businesses (deleted_at);
