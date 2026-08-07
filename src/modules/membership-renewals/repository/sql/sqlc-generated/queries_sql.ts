import { Sql } from "postgres"

export const getMemberStatusForRenewalQuery = `-- name: GetMemberStatusForRenewal :many


SELECT status
FROM members
WHERE id = $1
  AND deleted_at IS NULL`

export interface GetMemberStatusForRenewalArgs {
	id: string
}

export interface GetMemberStatusForRenewalRow {
	status: string
}

export async function getMemberStatusForRenewal(sql: Sql, args: GetMemberStatusForRenewalArgs): Promise<GetMemberStatusForRenewalRow[]> {
	return (await sql.unsafe(getMemberStatusForRenewalQuery, [args.id]).values()).map((row) => ({
		status: row[0],
	}))
}

export const insertMembershipRenewalQuery = `-- name: InsertMembershipRenewal :many
INSERT INTO membership_renewals (member_id, payment_slip_file_path, payment_date_at, status)
VALUES ($1, $2, NOW(), 'PENDING_REVIEW')
RETURNING id`

export interface InsertMembershipRenewalArgs {
	memberId: string
	paymentSlipFilePath: string
}

export interface InsertMembershipRenewalRow {
	id: string
}

export async function insertMembershipRenewal(sql: Sql, args: InsertMembershipRenewalArgs): Promise<InsertMembershipRenewalRow[]> {
	return (await sql.unsafe(insertMembershipRenewalQuery, [args.memberId, args.paymentSlipFilePath]).values()).map((row) => ({
		id: row[0],
	}))
}

export const updateMemberStatusOnRenewalQuery = `-- name: UpdateMemberStatusOnRenewal :exec
UPDATE members
SET status = 'PENDING_RENEWAL',
    latest_renewal_status = 'PENDING_REVIEW',
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL`

export interface UpdateMemberStatusOnRenewalArgs {
	id: string
}

export async function updateMemberStatusOnRenewal(sql: Sql, args: UpdateMemberStatusOnRenewalArgs): Promise<void> {
	await sql.unsafe(updateMemberStatusOnRenewalQuery, [args.id])
}
