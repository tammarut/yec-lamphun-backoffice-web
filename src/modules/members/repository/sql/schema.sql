-- ============================================================================
-- Table: positions
-- The org hierarchy of roles. Runtime-managed via admin UI.
--
-- IMPORTANT: Supervisor relationships are DERIVED from parent_position_code at
-- read time. They are NEVER stored on members. This removes the parent_id
-- reassignment chains that previously complicated add/update/delete flows.
-- ============================================================================

CREATE TABLE positions (
    code                 VARCHAR(30) PRIMARY KEY,
    name_th              VARCHAR(100) NOT NULL,
    name_en              VARCHAR(100) NOT NULL,
    -- SINGLE   = exactly one active holder (President, Secretary, each VP)
    -- MULTIPLE = many holders allowed (committee members, general members)
    cardinality          VARCHAR(10)  NOT NULL DEFAULT 'MULTIPLE',
    -- Self-reference: the position this one reports up to. NULL = top of tree.
    parent_position_code VARCHAR(30)  REFERENCES positions (code) ON DELETE SET NULL,
    display_order        INT          NOT NULL DEFAULT 0,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positions_cardinality CHECK (cardinality IN ('SINGLE', 'MULTIPLE'))
);

-- ============================================================================
-- Table: members
-- ============================================================================
CREATE TABLE members (
    id BIGSERIAL PRIMARY KEY,
    -- Registration Type
    registration_type VARCHAR(50) NOT NULL,
    -- Names (Thai and English)
    title_name_th VARCHAR(50) NOT NULL,
    first_name_th VARCHAR(100) NOT NULL,
    last_name_th VARCHAR(100) NOT NULL,
    title_name_en VARCHAR(50),
    first_name_en VARCHAR(100),
    last_name_en VARCHAR(100),
    nickname VARCHAR(100) NOT NULL,
    -- Personal Details
    gender VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    nationality VARCHAR(100) NOT NULL,
    -- Identification
    -- Stores: base64( IV [12 bytes] || Ciphertext [13 bytes] || Auth Tag [16 bytes] )
    id_card_no TEXT NOT NULL,
    -- Blind Index (HMAC-SHA256, 64-char hex) for lookups and uniqueness
    id_card_no_hash TEXT NOT NULL,
    id_card_expiry_date DATE NOT NULL,
    -- Membership & Profile
    member_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    profile_avatar TEXT,
    phone_no VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    line_id VARCHAR(100) UNIQUE,
    shirt_size VARCHAR(10),
    -- Position (FK to positions; hierarchy is DERIVED, NOT stored on members)
    position_code VARCHAR(30) NOT NULL REFERENCES positions (code) ON DELETE RESTRICT,
    -- Member Status
    status VARCHAR(50) NOT NULL,
    -- Cache Columns for performance
    renewal_successful_count INT NOT NULL DEFAULT 0,
    latest_renewal_status VARCHAR(50),
    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    -- Named CHECK constraints for all ENUM-like columns
    CONSTRAINT chk_members_registration_type CHECK (
        registration_type IN ('INDIVIDUAL', 'JURISTIC_PERSON')
    ),
    CONSTRAINT chk_members_gender CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    CONSTRAINT chk_members_shirt_size CHECK (
        shirt_size IN ('SSS', 'SS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL')
    ),
    CONSTRAINT chk_members_status CHECK (
        status IN ('ACTIVE', 'EXPIRED', 'PENDING_RENEWAL', 'RESIGNED')
    ),
    CONSTRAINT chk_members_latest_renewal_status CHECK (
        latest_renewal_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')
    )
    -- NOTE: chk_members_position is GONE — replaced by the FK to positions.
    -- NOTE: parent_id column is GONE — supervisor is derived at read time.
);
