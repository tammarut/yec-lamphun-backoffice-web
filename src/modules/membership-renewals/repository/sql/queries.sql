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

-- ============================================================================
-- Manual create renewal (POST /api/v1/membership/renewals/manual) — ADR-0016
-- A staff-only sibling of the public create-renewal flow. The repo reuses the
-- same InsertMembershipRenewal (status here is always 'APPROVED', which is
-- EXCLUDED from idx_one_pending_renewal_per_member, so this INSERT can never
-- raise 23505) but writes a DIFFERENT member UPDATE: the manual flow advances
-- the membership clock — it sets expires_at (end of next year, computed by the
-- shared computeMembershipExpiry util and passed as $2) and increments
-- renewal_successful_count. The two status columns are LITERALS (always ACTIVE
-- / APPROVED for a staff manual submission) rather than parameters, because the
-- manual route's withAuth contract already fixes them — there is no submission-
-- kind fork here.
-- ============================================================================

-- name: UpdateMemberOnManualRenewal :exec
-- The MANUAL member cache write — four columns (vs the public path's two).
-- $2 is the new expires_at (ISO 8601 string; the repo converts the aggregate's
-- Date so Bun.SQL's Date.toString() quirk does not reject it). Statuses are
-- literals per ADR-0016. Carries `deleted_at IS NULL` like every members write.
UPDATE members
SET status = 'ACTIVE',
    latest_renewal_status = 'APPROVED',
    expires_at = $2,
    renewal_successful_count = renewal_successful_count + 1,
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- ============================================================================
-- Renewal Stat (GET /api/v1/membership/renewals/stat) — ADR-0017
-- The three badge counts above the renewal-review table, from ONE aggregated
-- query over the members table. The module's first STATIC read — zero
-- parameters, nothing dynamic — so sqlc owns it per ADR-0010's letter (the two
-- list reads are dynamic, hence Bun SQL native). Reads ONLY the Renewal Cache
-- Columns: membership_renewals is never joined.
--
-- The expired count follows the spec's pseudocode LITERALLY —
-- `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'` — making it a
-- deliberate superset of the Expired Membership List (which keys on
-- status = 'EXPIRED' alone). The OR is currently redundant (no reject flow
-- exists, so a REJECTED latest renewal always rides on an EXPIRED member) but
-- self-heals cache drift and future-proofs the count if a review flow ever
-- leaves a rejected member non-EXPIRED. The three counts are NOT a partition:
-- a member may appear in more than one (e.g. EXPIRED again while its latest
-- renewal is still APPROVED).
--
-- Each aggregate is cast ::int (not BIGINT) so the driver returns a JS number.
-- COUNT with no GROUP BY always yields exactly one row — even over an empty
-- table (all zeros) — but the repo still guards with a zero-row fallback like
-- the members module's count pattern.
-- ============================================================================

-- name: GetRenewalStat :many
-- Single-row aggregate of the three Renewal Stat badge counts. :many per
-- ADR-0001; the repo narrows rows[0] with a zeros fallback.
SELECT
  (COUNT(*) FILTER (WHERE status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'))::int AS total_expired_members,
  (COUNT(*) FILTER (WHERE latest_renewal_status = 'PENDING_REVIEW'))::int AS total_pending_review_members,
  (COUNT(*) FILTER (WHERE latest_renewal_status = 'APPROVED'))::int AS total_approved_members
FROM members
WHERE deleted_at IS NULL;
