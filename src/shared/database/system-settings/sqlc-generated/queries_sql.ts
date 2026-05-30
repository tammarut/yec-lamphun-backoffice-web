import { Sql } from "postgres";

export const getAllSettingsQuery = `-- name: GetAllSettings :many
SELECT feature, value, description, created_at, updated_at
FROM system_settings`;

export interface GetAllSettingsRow {
    feature: string;
    value: any;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getAllSettings(sql: Sql): Promise<GetAllSettingsRow[]> {
    return (await sql.unsafe(getAllSettingsQuery, []).values()).map(row => ({
        feature: row[0],
        value: row[1],
        description: row[2],
        createdAt: row[3],
        updatedAt: row[4]
    }));
}

