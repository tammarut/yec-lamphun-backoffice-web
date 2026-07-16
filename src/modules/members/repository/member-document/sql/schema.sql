-- Step 1: Create the 'member_documents' table with constrained VARCHAR
CREATE TABLE member_documents (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL,

    -- Replaced ENUM with constrained VARCHAR
    type VARCHAR(50) NOT NULL,

    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Step 2: Named CHECK constraint for database-level enforcement
    CONSTRAINT chk_member_documents_type
    CHECK (type IN ('ID_CARD', 'COMPANY_CERTIFICATE', 'PAYMENT_SLIP')),

    -- Step 3: Foreign Key constraint
    CONSTRAINT fk_member_documents_member
      FOREIGN KEY(member_id)
      REFERENCES members(id)
      ON DELETE CASCADE
);