-- Step 4: Strictly necessary indexes only (for FK joins and cascades)
CREATE INDEX IF NOT EXISTS idx_membership_renewals_member_id ON membership_renewals(member_id);

CREATE INDEX IF NOT EXISTS idx_membership_renewals_status ON membership_renewals(status);

-- Prevent multiple PENDING_REVIEW renewals per member
CREATE UNIQUE INDEX idx_one_pending_renewal_per_member
ON membership_renewals (member_id)
WHERE status = 'PENDING_REVIEW'
    AND deleted_at IS NULL;