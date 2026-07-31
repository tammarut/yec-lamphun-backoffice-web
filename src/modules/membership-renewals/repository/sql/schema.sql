-- Step 1: Create the 'membership_renewals' table with VARCHAR
CREATE TABLE membership_renewals (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    payment_slip_file_path TEXT NOT NULL,
    payment_date_at TIMESTAMPTZ NOT NULL,
    -- Replaced ENUM with constrained VARCHAR
    status VARCHAR(50) NOT NULL,
    rejection_reason TEXT NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    -- Step 2: Named CHECK constraint for database-level enforcement
    CONSTRAINT chk_membership_renewals_status CHECK (
      status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')
    ),
    -- Step 3: Foreign Key constraint
    CONSTRAINT fk_renewal_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
  );