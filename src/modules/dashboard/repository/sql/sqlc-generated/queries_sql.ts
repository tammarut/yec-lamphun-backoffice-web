import { Sql } from "postgres"

export const getDashboardMemberStatusCountsQuery = `-- name: GetDashboardMemberStatusCounts :many

SELECT
  COUNT(*)::int AS total_members,
  (COUNT(*) FILTER (WHERE status = 'ACTIVE'))::int AS total_active_members,
  (COUNT(*) FILTER (WHERE status IN ('EXPIRED', 'PENDING_RENEWAL')))::int AS total_expired_members
FROM members
WHERE deleted_at IS NULL`

export interface GetDashboardMemberStatusCountsRow {
	totalMembers: number
	totalActiveMembers: number
	totalExpiredMembers: number
}

export async function getDashboardMemberStatusCounts(sql: Sql): Promise<GetDashboardMemberStatusCountsRow[]> {
	return (await sql.unsafe(getDashboardMemberStatusCountsQuery, []).values()).map((row) => ({
		totalMembers: row[0],
		totalActiveMembers: row[1],
		totalExpiredMembers: row[2],
	}))
}

export const countDashboardBusinessesQuery = `-- name: CountDashboardBusinesses :many
SELECT COUNT(*)::int AS total_businesses
FROM member_business
WHERE deleted_at IS NULL`

export interface CountDashboardBusinessesRow {
	totalBusinesses: number
}

export async function countDashboardBusinesses(sql: Sql): Promise<CountDashboardBusinessesRow[]> {
	return (await sql.unsafe(countDashboardBusinessesQuery, []).values()).map((row) => ({
		totalBusinesses: row[0],
	}))
}

export const getDashboardMemberCountsByYearQuery = `-- name: GetDashboardMemberCountsByYear :many
SELECT EXTRACT(YEAR FROM (member_since AT TIME ZONE 'Asia/Bangkok'))::int AS year, COUNT(*)::int AS count
FROM members
WHERE deleted_at IS NULL
  AND EXTRACT(YEAR FROM (member_since AT TIME ZONE 'Asia/Bangkok'))::int >= $1::int
GROUP BY 1
ORDER BY 1 ASC`

export interface GetDashboardMemberCountsByYearArgs {
	minYear: number
}

export interface GetDashboardMemberCountsByYearRow {
	year: number
	count: number
}

export async function getDashboardMemberCountsByYear(sql: Sql, args: GetDashboardMemberCountsByYearArgs): Promise<GetDashboardMemberCountsByYearRow[]> {
	return (await sql.unsafe(getDashboardMemberCountsByYearQuery, [args.minYear]).values()).map((row) => ({
		year: row[0],
		count: row[1],
	}))
}
