-- Step 4: Strictly necessary indexes only
-- Required for the Foreign Key constraint (speeds up JOINs and ON DELETE CASCADE)
CREATE INDEX IF NOT EXISTS idx_member_documents_member_id ON member_documents (member_id);