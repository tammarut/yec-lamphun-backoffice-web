-- ============================================================================
-- Migration: membership_renewals.group_id — the Renewal Group marker (ADR-0026)
-- Map ticket: https://github.com/tammarut/yec-lamphun-backoffice-web/issues/84
-- Run BEFORE (or together with) the #84 deploy — the new app writes group_id
-- on every INSERT, so a pre-migration database makes every renewal create 500.
-- Safe to run more than once (existence-guarded); every statement is a no-op
-- after a successful run.
-- One transaction: ANY failure rolls the whole thing back (PG DDL is tx-safe).
--
-- Operator runbook (DBeaver):
--   STEP 1 — (optional) backup, in a SEPARATE editor tab, run first:
--       CREATE TABLE membership_renewals_pre_b84 AS SELECT * FROM membership_renewals;
--   STEP 2 — run THIS WHOLE FILE at once ("Execute script", Alt+X — never
--       statement-by-statement; DBeaver keeps executing after an error).
--       After any error, confirm nothing applied:
--           SELECT column_name FROM information_schema.columns
--            WHERE table_name = 'membership_renewals' AND column_name = 'group_id';
--       (expect zero rows on a rolled-back run)
--   STEP 3 — post-checks after COMMIT:
--       · column exists and is nullable:
--           SELECT column_name, data_type, is_nullable FROM information_schema.columns
--            WHERE table_name = 'membership_renewals' AND column_name = 'group_id';
--         (expect uuid / YES)
--       · partial index exists:
--           SELECT indexname FROM pg_indexes
--            WHERE tablename = 'membership_renewals'
--              AND indexname = 'idx_membership_renewals_group_id';
--   Cleanup, once #84 is verified:
--       DROP TABLE membership_renewals_pre_b84;
--   Shell alternative:
--       psql -v ON_ERROR_STOP=1 -f group-id-migration.sql
-- ============================================================================

BEGIN;

-- 1. The marker column — nullable; NULL = solo submission (ADR-0026).
ALTER TABLE membership_renewals ADD COLUMN IF NOT EXISTS group_id UUID NULL;

-- 2. Sibling-lookup partial index over non-NULL markers (same statement lives
--    in the module's index.sql). Non-unique by design: a group IS N rows.
CREATE INDEX IF NOT EXISTS idx_membership_renewals_group_id
    ON membership_renewals (group_id)
    WHERE group_id IS NOT NULL;

COMMIT;
