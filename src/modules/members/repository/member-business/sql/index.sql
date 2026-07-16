-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_member_business_member_id ON member_business(member_id);
CREATE INDEX IF NOT EXISTS idx_member_business_category_id ON member_business(category_id);
CREATE INDEX IF NOT EXISTS idx_member_business_deleted_at ON member_business(deleted_at);