import { Sql } from "postgres"

export const getAllSettingsQuery = `-- name: GetAllSettings :many
SELECT feature, value, description, created_at, updated_at
FROM system_settings`

export interface GetAllSettingsRow {
	feature: string
	value: any
	description: string | null
	createdAt: Date
	updatedAt: Date
}

export async function getAllSettings(sql: Sql): Promise<GetAllSettingsRow[]> {
	return (await sql.unsafe(getAllSettingsQuery, []).values()).map((row) => ({
		feature: row[0],
		value: row[1],
		description: row[2],
		createdAt: row[3],
		updatedAt: row[4],
	}))
}

export const updateSettingQuery = `-- name: UpdateSetting :exec
UPDATE system_settings
SET value = to_jsonb($2), updated_at = NOW()
WHERE feature = $1`

export interface UpdateSettingArgs {
	feature: string
	value: string
}

export async function updateSetting(sql: Sql, args: UpdateSettingArgs): Promise<void> {
	await sql.unsafe(updateSettingQuery, [args.feature, args.value])
}
