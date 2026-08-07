-- sqlc queries for the membership-renewals module.
-- All single-row queries are annotated :many (never :one) per ADR-0001, because
-- noUncheckedIndexedAccess makes sqlc's :one template (`const row = rows[0]`)
-- fail type-checking; single rows are narrowed in hand-written repository code.

-- ============================================================================
-- Create renewal (POST /api/v1/membership/renewals) — ADR-0014
-- The MembershipRenewalsRepository owns the cross-table transaction: it reads
-- the member status (OUTSIDE the tx, for the 404/403/409 pre-check branches),
-- then inside one tx INSERTs the renewal row and UPDATEs the member's Renewal
-- Cache Columns. The members schema is referenced in this sqlc block for FK/type
-- parsing only — no TS cross-import (symmetric with ADR-0013, where the members
-- block references this schema for the cascade soft-delete).
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
-- Insert the renewal row INSIDE the tx. payment_date_at and status are fixed
-- literals (NOW() and 'PENDING_REVIEW'), not parameters — the client never
-- supplies them. The partial unique index idx_one_pending_renewal_per_member
-- (WHERE status = 'PENDING_REVIEW' AND deleted_at IS NULL) may reject this with
-- Postgres error code 23505 under a race that beats the pre-check; the repo
-- catches that code and maps it to PendingRenewalExistsError → 409.
INSERT INTO membership_renewals (member_id, payment_slip_file_path, payment_date_at, status)
VALUES ($1, $2, NOW(), 'PENDING_REVIEW')
RETURNING id;

-- name: UpdateMemberStatusOnRenewal :exec
-- Update the member's Renewal Cache Columns inside the SAME tx (ADR-0014):
-- status → 'PENDING_RENEWAL', latest_renewal_status → 'PENDING_REVIEW'. Carries
-- `deleted_at IS NULL` to match every other members write query; if the member
-- were soft-deleted between the pre-check and the tx this affects 0 rows (the
-- pre-check SELECT already guards deleted_at, so this is belt-and-suspenders).
UPDATE members
SET status = 'PENDING_RENEWAL',
    latest_renewal_status = 'PENDING_REVIEW',
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;
