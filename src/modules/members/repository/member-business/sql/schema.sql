-- Step 1: Create the 'member_business'
CREATE TABLE member_business (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    juristic_registration_no VARCHAR(50) NOT NULL,
    category_id SMALLINT NOT NULL,
    address TEXT,

    -- Location: [Longitude, Latitude], optional (spec: not in business required list).
    -- precision: ample for GPS (approx 11cm precision)
    -- check: ensures we don't get empty arrays or 3D points when provided.
    -- Postgres CHECK passes NULL automatically, so the cardinality constraint
    -- applies only when a value is given.
    location DOUBLE PRECISION[] CHECK (cardinality(location) = 2),

    core_business TEXT,
    website TEXT,
    logo_file_path TEXT,
    product_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Enforce 1 member : 1 business (see ADR-0005).
    -- Without this UNIQUE, the plain FK below allows many business rows per member.
    CONSTRAINT uniq_member_business_member UNIQUE (member_id),

    -- Step 4: Define Foreign Key constraints
    CONSTRAINT fk_member_business_member
      FOREIGN KEY(member_id)
      REFERENCES members(id)
      ON DELETE CASCADE,

    CONSTRAINT fk_member_business_category
      FOREIGN KEY(category_id)
      REFERENCES business_categories(id)
);