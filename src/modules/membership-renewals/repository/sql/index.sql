-- Step 4: Strictly necessary indexes only (for FK joins and cascades)
CREATE INDEX IF NOT EXISTS idx_membership_renewals_member_id ON membership_renewals(member_id);

CREATE INDEX IF NOT EXISTS idx_membership_renewals_status ON membership_renewals(status);

-- Prevent multiple PENDING_REVIEW renewals per member
CREATE UNIQUE INDEX idx_one_pending_renewal_per_member
ON membership_renewals (member_id)
WHERE status = 'PENDING_REVIEW'
    AND deleted_at IS NULL;

-- Renewal Group sibling lookup (ADR-0026): cluster the rows of one bulk
-- submission. Non-unique by design — a group IS N rows sharing the marker.
CREATE INDEX IF NOT EXISTS idx_membership_renewals_group_id
ON membership_renewals (group_id)
WHERE group_id IS NOT NULL;