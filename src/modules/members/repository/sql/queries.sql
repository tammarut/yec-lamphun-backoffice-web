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
