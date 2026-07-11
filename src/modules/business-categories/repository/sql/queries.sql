-- name: GetBusinessCategories :many
SELECT id, name
FROM business_categories
ORDER BY id ASC;
