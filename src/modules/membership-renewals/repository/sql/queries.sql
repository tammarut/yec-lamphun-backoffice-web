-- sqlc queries for the membership-renewals module.
-- All single-row queries are annotated :many (never :one) per ADR-0001, because
-- noUncheckedIndexedAccess makes sqlc's :one template (`const row = rows[0]`)
-- fail type-checking; single rows are narrowed in hand-written repository code.

-- ============================================================================
-- Create renewal (POST /api/v1/membership/renewals) — ADR-0014 / ADR-0015
-- The route is PUBLIC with an optional admin instant-approval bypass. The
-- MembershipRenewalsRepository owns the cross-table transaction: it reads the
-- member status (OUTSIDE the tx, for the 404/403/409 pre-check branches), then
-- inside one tx INSERTs the renewal row and UPDATEs the member's Renewal Cache
-- Columns. The status values are PARAMETERS (not literals) so one query pair
-- serves both submission kinds:
--   public  -> renewal 'PENDING_REVIEW', member 'PENDING_RENEWAL'
--   admin   -> renewal 'APPROVED',       member 'ACTIVE'
-- The members schema is referenced in this sqlc block for FK/type parsing only
-- — no TS cross-import (symmetric with ADR-0013, where the members block
-- references this schema for the cascade soft-delete).
-- ============================================================================

-- name: GetMemberStatusForRenewal :many
-- Pre-check read (runs OUTSIDE the create-renewal transaction). Fetches only the
-- status column the service needs for its 404/403/409 early-exit branches.
-- Returns no row when the member does not exist or is soft-deleted (the repo
-- narrows that to null → the service maps to 404).
SELECT status
FROM members
WHERE id = $1
  AND deleted_at IS NULL;

-- name: InsertMembershipRenewal :many
-- Insert the renewal row INSIDE the tx. payment_date_at is fixed (NOW()); the
-- status is a parameter ($3) selected by the service from the submission kind
-- (PENDING_REVIEW public / APPROVED admin). The partial unique index
-- idx_one_pending_renewal_per_member covers status = 'PENDING_REVIEW' ONLY, so a
-- public insert may hit Postgres code 23505 under a race that beats the
-- pre-check; the repo catches that code and maps it to PendingRenewalExistsError.
-- An admin insert (status='APPROVED') is excluded from that index and cannot 23505.
INSERT INTO membership_renewals (member_id, payment_slip_file_path, payment_date_at, status)
VALUES ($1, $2, NOW(), $3)
RETURNING id;

-- name: UpdateMemberStatusOnRenewal :exec
-- Update the member's Renewal Cache Columns inside the SAME tx (ADR-0014). Both
-- status values are parameters: member status $2 (PENDING_RENEWAL public /
-- ACTIVE admin), latest_renewal_status $3 (PENDING_REVIEW public / APPROVED
-- admin). Carries `deleted_at IS NULL` to match every other members write
-- query; expires_at and renewal_successful_count are deliberately NOT touched
-- (out of scope — owned by the future review/approve API).
UPDATE members
SET status = $2,
    latest_renewal_status = $3,
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;
