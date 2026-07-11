import { Sql } from "postgres"

export const getBusinessCategoriesQuery = `-- name: GetBusinessCategories :many
SELECT id, name
FROM business_categories
ORDER BY id ASC`

export interface GetBusinessCategoriesRow {
	id: number
	name: string
}

export async function getBusinessCategories(sql: Sql): Promise<GetBusinessCategoriesRow[]> {
	return (await sql.unsafe(getBusinessCategoriesQuery, []).values()).map((row) => ({
		id: row[0],
		name: row[1],
	}))
}
