-- ============================================================================
-- Migration: membership_renewals becomes the Membership Payment Ledger (ADR-0033)
-- Map ticket: https://github.com/tammarut/yec-lamphun-backoffice-web/issues/151
-- Run ONCE, manually:  psql -v ON_ERROR_STOP=1 -f payment-type-migration.sql
-- One transaction: ANY failure rolls the whole thing back (PG DDL is tx-safe).
-- Before running:  pg_dump ... > pre-payment-type-migration.dump
--
-- Existing rows need NO data migration: the new `type` column defaults to
-- 'RENEWAL', so every current row stays a renewal. Idempotent statements —
-- safe to re-run after a partial application.
-- ============================================================================

BEGIN;

-- 1. `type` discriminator (PG 11+: NOT NULL DEFAULT add is metadata-only —
--    no table rewrite, existing rows read 'RENEWAL').
ALTER TABLE membership_renewals
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'RENEWAL';

-- 2. Named CHECK constraint (guard: ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_membership_renewals_type'
  ) THEN
    ALTER TABLE membership_renewals
      ADD CONSTRAINT chk_membership_renewals_type
      CHECK (type IN ('RENEWAL', 'REGISTRATION'));
  END IF;
END
$$;

-- 3. At most one live REGISTRATION row per member (ADR-0033).
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_registration_payment_per_member
ON membership_renewals (member_id)
WHERE type = 'REGISTRATION'
  AND deleted_at IS NULL;

COMMIT;

-- Post-run checks (information_schema):
--   SELECT column_name, column_default FROM information_schema.columns
--     WHERE table_name = 'membership_renewals' AND column_name = 'type';
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'membership_renewals'::regclass AND conname LIKE 'chk_membership_renewals_type';
--   SELECT indexname FROM pg_indexes
--     WHERE tablename = 'membership_renewals' AND indexname = 'idx_one_registration_payment_per_member';
