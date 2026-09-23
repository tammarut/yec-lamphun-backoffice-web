-- ============================================================================
-- Table: businesses
-- The shared business entity (spec #66). Extracted from member_business by
-- businesses-migration.sql (runs at the cutover ticket); members link to it
-- via members.business_id (FK below). Co-owners soft-share one row by
-- reference: logo/product file paths live HERE, not on the member link.
--
-- Identity + invariants:
--   · juristic_registration_no is the dedupe identity key — exact match,
--     unique among LIVE rows only (see index.sql). Soft-deleting a business
--     releases the number for re-registration.
--   · "non-deleted business ⇔ ≥1 live member" holds by construction: the
--     member-delete tx soft-deletes the business when it removes the last
--     live members.business_id pointer (ADR-0013 ownership, cascade rule).
-- ============================================================================

CREATE TABLE businesses (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    -- Dedupe identity key (locked: exact match, live rows only)
    juristic_registration_no VARCHAR(50) NOT NULL,
    category_id SMALLINT NOT NULL,
    address TEXT,
    -- Location: [Longitude, Latitude], optional
    location DOUBLE PRECISION[] CHECK (cardinality(location) = 2),
    core_business TEXT,
    website TEXT,
    logo_file_path TEXT,
    product_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_businesses_category
        FOREIGN KEY (category_id) REFERENCES business_categories(id)
);
