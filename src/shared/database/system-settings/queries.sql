-- name: GetAllSettings :many
SELECT feature, value, description, created_at, updated_at
FROM system_settings;
