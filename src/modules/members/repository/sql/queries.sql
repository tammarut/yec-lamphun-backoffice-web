-- sqlc queries for the members module.
-- All single-row queries are annotated :many (never :one) per ADR-0001, because
-- noUncheckedIndexedAccess makes sqlc's :one template (`const row = rows[0]`)
-- fail type-checking; single rows are narrowed in hand-written repository code.

-- name: CountMemberByIdCardHash :many
-- Duplicate-id_card check (runs OUTSIDE the create-member transaction).
-- Counting is enough for an existence check; the unique index
-- members_id_card_hash_unique_idx is the real guard.
SELECT count(*)::int AS count
FROM members
WHERE id_card_no_hash = $1
  AND deleted_at IS NULL;

-- name: GetPositionByCode :many
-- Fetch cardinality + parent for the position-conflict check and validation.
SELECT code, name_th, name_en, cardinality, parent_position_code, display_order, is_active
FROM positions
WHERE code = $1;

-- name: CountActiveHolderByPosition :many
-- Position-occupied check for SINGLE positions (see ADR-0006). Returns the
-- count of non-deleted members currently holding the position.
SELECT count(*)::int AS count
FROM members
WHERE position_code = $1
  AND deleted_at IS NULL;

-- name: InsertMember :many
-- Insert the member row and return the generated id. Runs INSIDE the tx.
-- Columns omitted here (renewal_successful_count, latest_renewal_status,
-- created_at, updated_at) take their defaults.
INSERT INTO members (
    registration_type,
    title_name_th, first_name_th, last_name_th,
    title_name_en, first_name_en, last_name_en,
    nickname,
    gender, date_of_birth, nationality,
    id_card_no, id_card_no_hash, id_card_expiry_date,
    member_since, expires_at,
    profile_avatar,
    phone_no, email, line_id,
    shirt_size,
    position_code,
    status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
)
RETURNING id;

-- name: InsertMemberDocument :exec
-- Insert one document row for a member. Called once per provided document
-- inside the tx.
INSERT INTO member_documents (member_id, type, file_path)
VALUES ($1, $2, $3);

-- name: InsertMemberBusiness :exec
-- Insert the member's business record with location already swapped to
-- [long, lat]. Runs INSIDE the tx.
INSERT INTO member_business (
    member_id, name, description, juristic_registration_no, category_id,
    address, location, core_business, website, logo_file_path, product_file_path
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
);

-- ============================================================================
-- Read queries (GET /api/v1/members/:id)
-- ============================================================================

-- name: GetMemberWithBusinessById :many
-- Fetch a non-deleted member and its 1:1 non-deleted business in one round-trip.
-- `:many` per ADR-0001; the repository narrows the single row by hand.
-- business_* columns are NULL when the business row is soft-deleted or absent
-- (the LEFT JOIN's soft-delete filter lives in the ON clause so a missing
-- business does not drop the member). The repository treats a live member with
-- no business row as corruption → DatabaseError → 500 (grilling Q6/iii-a).
SELECT m.id,
       m.registration_type,
       m.title_name_th, m.first_name_th, m.last_name_th,
       m.title_name_en, m.first_name_en, m.last_name_en,
       m.nickname,
       m.gender, m.date_of_birth, m.nationality,
       m.id_card_no, m.id_card_expiry_date,
       m.member_since, m.expires_at,
       m.profile_avatar,
       m.phone_no, m.email, m.line_id,
       m.shirt_size,
       m.position_code, m.status,
       m.id_card_no_hash,
       m.renewal_successful_count,
       m.created_at, m.updated_at,
       b.id            AS business_id,
       b.name          AS business_name,
       b.description   AS business_description,
       b.juristic_registration_no,
       b.category_id,
       b.address,
       b.location,
       b.core_business,
       b.website,
       b.logo_file_path,
       b.product_file_path,
       b.created_at    AS business_created_at,
       b.updated_at    AS business_updated_at
FROM members m
LEFT JOIN member_business b
       ON b.member_id = m.id
      AND b.deleted_at IS NULL
WHERE m.id = $1
  AND m.deleted_at IS NULL;

-- name: GetMemberDocumentsByMemberId :many
-- Latest-wins documents for a member (grilling Q5/A). Ordered so the first row
-- of each type is the newest; the repository takes the first per type.
-- PAYMENT_SLIP is intentionally excluded — out of scope for this endpoint.
SELECT type, file_path, created_at
FROM member_documents
WHERE member_id = $1
  AND deleted_at IS NULL
  AND type IN ('ID_CARD', 'COMPANY_CERTIFICATE')
ORDER BY type, created_at DESC;

-- ============================================================================
-- Update queries (PATCH /api/v1/members/:id)
-- ============================================================================

-- name: UpdateMemberById :exec
-- Update a non-deleted member's mutable columns. Deliberately OMITS the
-- lifecycle columns (status, member_since, expires_at,
-- renewal_successful_count, latest_renewal_status) — PATCH must not reset
-- membership tenure or expiry (grilling Q4). updated_at is bumped server-side.
-- created_at / id / deleted_at are never written here.
UPDATE members SET
    registration_type = $2,
    title_name_th = $3, first_name_th = $4, last_name_th = $5,
    title_name_en = $6, first_name_en = $7, last_name_en = $8,
    nickname = $9,
    gender = $10, date_of_birth = $11, nationality = $12,
    id_card_no = $13, id_card_no_hash = $14, id_card_expiry_date = $15,
    profile_avatar = $16,
    phone_no = $17, email = $18, line_id = $19,
    shirt_size = $20,
    position_code = $21,
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- name: UpdateMemberBusinessByMemberId :exec
-- Update the member's 1:1 non-deleted business row. location must arrive
-- already swapped to [long, lat] (the MemberBusiness VO owns the swap).
-- updated_at is bumped server-side.
UPDATE member_business SET
    name = $2,
    description = $3,
    juristic_registration_no = $4,
    category_id = $5,
    address = $6,
    location = $7,
    core_business = $8,
    website = $9,
    logo_file_path = $10,
    product_file_path = $11,
    updated_at = NOW()
WHERE member_id = $1
  AND deleted_at IS NULL;

-- name: SoftDeleteMemberDocumentsByMemberIdAndTypes :exec
-- Soft-delete (set deleted_at) the member's non-deleted document rows of the
-- given type(s), in preparation for inserting replacement rows. Used when a
-- PATCH provides a non-null id_card_image and/or company_certificate
-- (grilling Q6: soft-delete preserves version history; the latest-wins read
-- query already filters deleted_at IS NULL). The service only calls this with
-- a non-empty types list — the closed set is {'ID_CARD', 'COMPANY_CERTIFICATE'}.
UPDATE member_documents
SET deleted_at = NOW(), updated_at = NOW()
WHERE member_id = $1
  AND type = ANY(sqlc.arg('types')::text[])
  AND deleted_at IS NULL;

-- ============================================================================
-- Delete queries (DELETE /api/v1/members/:id) — ADR-0013
-- Atomic cascade soft-delete in spec order: member_documents → member_business
-- → membership_renewals → members. All idempotent (deleted_at IS NULL guard),
-- so an already-deleted member is a 0-row no-op that still returns 204
-- (grilling Q2: the route is 204 regardless, never 404). The repository runs
-- these four inside one transaction; order matches the spec's sequence diagram
-- verbatim (grilling Q4) even though it is semantically irrelevant for a
-- soft-delete (no RESTRICT FKs, no triggers).
-- ============================================================================

-- name: SoftDeleteMemberDocumentsByMemberId :exec
-- 1. member_documents (all types for the member, not just the replaced subset).
UPDATE member_documents
SET deleted_at = NOW(), updated_at = NOW()
WHERE member_id = $1
  AND deleted_at IS NULL;

-- name: SoftDeleteMemberBusinessByMemberId :exec
-- 2. member_business (the member's 1:1 business record).
UPDATE member_business
SET deleted_at = NOW(), updated_at = NOW()
WHERE member_id = $1
  AND deleted_at IS NULL;

-- name: SoftDeleteMembershipRenewalsByMemberId :exec
-- 3. membership_renewals (all renewals for the member). The table lives in a
-- separate module (src/modules/membership-renewals/); its schema is referenced
-- in the members sqlc block for FK parsing only — no TS cross-import (ADR-0013).
UPDATE membership_renewals
SET deleted_at = NOW(), updated_at = NOW()
WHERE member_id = $1
  AND deleted_at IS NULL;

-- name: SoftDeleteMemberById :exec
-- 4. members (the member row itself).
UPDATE members
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL;

-- ============================================================================
-- Get latest renewal by member_id (GET /api/v1/membership/renewals/:member_id)
-- A single round-trip for the backoffice "latest renewal" single-view: a
-- non-deleted member + its 1:1 business + the single newest non-deleted renewal
-- (id DESC, LIMIT 1) via LEFT JOIN LATERAL. Static query -> sqlc (ADR-0010).
-- `:many` per ADR-0001; the repository narrows the single row by hand.
--
-- The INNER JOIN on member_business collapses a member-with-no-live-business to
-- 0 rows (the repo maps that to null -> "Member or renewal not found" 404). The
-- LEFT LATERAL keeps a member-with-no-renewal as ONE row with NULL renewal_*
-- columns, so the service can distinguish it as the distinct "no renewal" 404.
-- membership_renewals is referenced here for FK/type parsing only — no TS
-- cross-import (same pattern as the ADR-0013 cascade soft-delete above).
-- ============================================================================

-- name: GetLatestRenewalByMemberId :many
SELECT
  m.id,
  m.profile_avatar,
  m.title_name_th,
  m.first_name_th,
  m.last_name_th,
  m.nickname,
  m.phone_no,
  m.position_code,
  mb.name AS business_name,
  mr.id AS renewal_id,
  mr.payment_date_at AS renewal_payment_date_at,
  mr.payment_slip_file_path AS renewal_payment_slip_file_path
FROM members m
JOIN member_business mb ON m.id = mb.member_id AND mb.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT id, payment_date_at, payment_slip_file_path
  FROM membership_renewals
  WHERE member_id = m.id AND deleted_at IS NULL
  ORDER BY id DESC
  LIMIT 1
) mr ON true
WHERE m.id = $1
  AND m.deleted_at IS NULL;
