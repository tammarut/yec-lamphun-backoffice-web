import { Sql } from "postgres"

export const countMemberByIdCardHashQuery = `-- name: CountMemberByIdCardHash :many

SELECT count(*)::int AS count
FROM members
WHERE id_card_no_hash = $1
  AND deleted_at IS NULL`

export interface CountMemberByIdCardHashArgs {
	idCardNoHash: string
}

export interface CountMemberByIdCardHashRow {
	count: number
}

export async function countMemberByIdCardHash(sql: Sql, args: CountMemberByIdCardHashArgs): Promise<CountMemberByIdCardHashRow[]> {
	return (await sql.unsafe(countMemberByIdCardHashQuery, [args.idCardNoHash]).values()).map((row) => ({
		count: row[0],
	}))
}

export const getPositionByCodeQuery = `-- name: GetPositionByCode :many
SELECT code, name_th, name_en, cardinality, parent_position_code, display_order, is_active
FROM positions
WHERE code = $1`

export interface GetPositionByCodeArgs {
	code: string
}

export interface GetPositionByCodeRow {
	code: string
	nameTh: string
	nameEn: string
	cardinality: string
	parentPositionCode: string | null
	displayOrder: number
	isActive: boolean
}

export async function getPositionByCode(sql: Sql, args: GetPositionByCodeArgs): Promise<GetPositionByCodeRow[]> {
	return (await sql.unsafe(getPositionByCodeQuery, [args.code]).values()).map((row) => ({
		code: row[0],
		nameTh: row[1],
		nameEn: row[2],
		cardinality: row[3],
		parentPositionCode: row[4],
		displayOrder: row[5],
		isActive: row[6],
	}))
}

export const countActiveHolderByPositionQuery = `-- name: CountActiveHolderByPosition :many
SELECT count(*)::int AS count
FROM members
WHERE position_code = $1
  AND deleted_at IS NULL`

export interface CountActiveHolderByPositionArgs {
	positionCode: string
}

export interface CountActiveHolderByPositionRow {
	count: number
}

export async function countActiveHolderByPosition(sql: Sql, args: CountActiveHolderByPositionArgs): Promise<CountActiveHolderByPositionRow[]> {
	return (await sql.unsafe(countActiveHolderByPositionQuery, [args.positionCode]).values()).map((row) => ({
		count: row[0],
	}))
}

export const insertMemberQuery = `-- name: InsertMember :many
INSERT INTO members (
    registration_type,
    title_name_th, first_name_th, last_name_th,
    title_name_en, first_name_en, last_name_en,
    nickname,
    gender, date_of_birth, nationality,
    id_card_no, id_card_no_hash, id_card_expiry_date,
    member_since, expires_at,
    profile_avatar,
    phone_no, email, line_id,
    shirt_size,
    position_code,
    status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
)
RETURNING id`

export interface InsertMemberArgs {
	registrationType: string
	titleNameTh: string
	firstNameTh: string
	lastNameTh: string
	titleNameEn: string | null
	firstNameEn: string | null
	lastNameEn: string | null
	nickname: string
	gender: string
	dateOfBirth: Date
	nationality: string
	idCardNo: string
	idCardNoHash: string
	idCardExpiryDate: Date
	memberSince: Date
	expiresAt: Date | null
	profileAvatar: string | null
	phoneNo: string
	email: string | null
	lineId: string | null
	shirtSize: string | null
	positionCode: string
	status: string
}

export interface InsertMemberRow {
	id: string
}

export async function insertMember(sql: Sql, args: InsertMemberArgs): Promise<InsertMemberRow[]> {
	return (
		await sql
			.unsafe(insertMemberQuery, [
				args.registrationType,
				args.titleNameTh,
				args.firstNameTh,
				args.lastNameTh,
				args.titleNameEn,
				args.firstNameEn,
				args.lastNameEn,
				args.nickname,
				args.gender,
				args.dateOfBirth,
				args.nationality,
				args.idCardNo,
				args.idCardNoHash,
				args.idCardExpiryDate,
				args.memberSince,
				args.expiresAt,
				args.profileAvatar,
				args.phoneNo,
				args.email,
				args.lineId,
				args.shirtSize,
				args.positionCode,
				args.status,
			])
			.values()
	).map((row) => ({
		id: row[0],
	}))
}

export const insertMemberDocumentQuery = `-- name: InsertMemberDocument :exec
INSERT INTO member_documents (member_id, type, file_path)
VALUES ($1, $2, $3)`

export interface InsertMemberDocumentArgs {
	memberId: string
	type: string
	filePath: string
}

export async function insertMemberDocument(sql: Sql, args: InsertMemberDocumentArgs): Promise<void> {
	await sql.unsafe(insertMemberDocumentQuery, [args.memberId, args.type, args.filePath])
}

export const insertMemberBusinessQuery = `-- name: InsertMemberBusiness :exec
INSERT INTO member_business (
    member_id, name, description, juristic_registration_no, category_id,
    address, location, core_business, website, logo_file_path, product_file_path
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)`

export interface InsertMemberBusinessArgs {
	memberId: string
	name: string
	description: string
	juristicRegistrationNo: string
	categoryId: number
	address: string | null
	location: number[] | null
	coreBusiness: string | null
	website: string | null
	logoFilePath: string | null
	productFilePath: string | null
}

export async function insertMemberBusiness(sql: Sql, args: InsertMemberBusinessArgs): Promise<void> {
	await sql.unsafe(insertMemberBusinessQuery, [
		args.memberId,
		args.name,
		args.description,
		args.juristicRegistrationNo,
		args.categoryId,
		args.address,
		args.location,
		args.coreBusiness,
		args.website,
		args.logoFilePath,
		args.productFilePath,
	])
}
