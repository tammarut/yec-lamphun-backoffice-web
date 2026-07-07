-- name: GetAllSettings :many
SELECT feature, value, description, created_at, updated_at
FROM system_settings;

-- name: UpdateSetting :one
UPDATE system_settings
SET value = to_jsonb(sqlc.arg('value')), updated_at = NOW()
WHERE feature = $1
RETURNING feature, value, description, created_at, updated_at;
