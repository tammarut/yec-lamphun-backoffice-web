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
VALUES ($1, $2, NOW(), $3)
RETURNING id`

export interface InsertMembershipRenewalArgs {
	memberId: string
	paymentSlipFilePath: string
	status: string
}

export interface InsertMembershipRenewalRow {
	id: string
}

export async function insertMembershipRenewal(sql: Sql, args: InsertMembershipRenewalArgs): Promise<InsertMembershipRenewalRow[]> {
	return (await sql.unsafe(insertMembershipRenewalQuery, [args.memberId, args.paymentSlipFilePath, args.status]).values()).map((row) => ({
		id: row[0],
	}))
}

export const updateMemberStatusOnRenewalQuery = `-- name: UpdateMemberStatusOnRenewal :exec
UPDATE members
SET status = $2,
    latest_renewal_status = $3,
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL`

export interface UpdateMemberStatusOnRenewalArgs {
	id: string
	status: string
	latestRenewalStatus: string | null
}

export async function updateMemberStatusOnRenewal(sql: Sql, args: UpdateMemberStatusOnRenewalArgs): Promise<void> {
	await sql.unsafe(updateMemberStatusOnRenewalQuery, [args.id, args.status, args.latestRenewalStatus])
}

export const updateMemberOnManualRenewalQuery = `-- name: UpdateMemberOnManualRenewal :exec

UPDATE members
SET status = 'ACTIVE',
    latest_renewal_status = 'APPROVED',
    expires_at = $2,
    renewal_successful_count = renewal_successful_count + 1,
    updated_at = NOW()
WHERE id = $1
  AND deleted_at IS NULL`

export interface UpdateMemberOnManualRenewalArgs {
	id: string
	expiresAt: string
}

export async function updateMemberOnManualRenewal(sql: Sql, args: UpdateMemberOnManualRenewalArgs): Promise<void> {
	await sql.unsafe(updateMemberOnManualRenewalQuery, [args.id, args.expiresAt])
}

export const getRenewalStatQuery = `-- name: GetRenewalStat :many

SELECT
  (COUNT(*) FILTER (WHERE status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'))::int AS total_expired_members,
  (COUNT(*) FILTER (WHERE latest_renewal_status = 'PENDING_REVIEW'))::int AS total_pending_review_members,
  (COUNT(*) FILTER (WHERE latest_renewal_status = 'APPROVED'))::int AS total_approved_members
FROM members
WHERE deleted_at IS NULL`

export interface GetRenewalStatRow {
	totalExpiredMembers: number
	totalPendingReviewMembers: number
	totalApprovedMembers: number
}

export async function getRenewalStat(sql: Sql): Promise<GetRenewalStatRow[]> {
	return (await sql.unsafe(getRenewalStatQuery, []).values()).map((row) => ({
		totalExpiredMembers: row[0],
		totalPendingReviewMembers: row[1],
		totalApprovedMembers: row[2],
	}))
}
