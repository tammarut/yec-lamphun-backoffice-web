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

export const getMemberWithBusinessByIdQuery = `-- name: GetMemberWithBusinessById :many

SELECT m.id,
       m.registration_type,
       m.title_name_th, m.first_name_th, m.last_name_th,
       m.title_name_en, m.first_name_en, m.last_name_en,
       m.nickname,
       m.gender, m.date_of_birth, m.nationality,
       m.id_card_no, m.id_card_expiry_date,
       m.member_since, m.expires_at,
       m.profile_avatar,
       m.phone_no, m.email, m.line_id,
       m.shirt_size,
       m.position_code, m.status,
       m.created_at, m.updated_at,
       b.id            AS business_id,
       b.name          AS business_name,
       b.description   AS business_description,
       b.juristic_registration_no,
       b.category_id,
       b.address,
       b.location,
       b.core_business,
       b.website,
       b.logo_file_path,
       b.product_file_path,
       b.created_at    AS business_created_at,
       b.updated_at    AS business_updated_at
FROM members m
LEFT JOIN member_business b
       ON b.member_id = m.id
      AND b.deleted_at IS NULL
WHERE m.id = $1
  AND m.deleted_at IS NULL`

export interface GetMemberWithBusinessByIdArgs {
	id: string
}

export interface GetMemberWithBusinessByIdRow {
	id: string
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
	createdAt: Date
	updatedAt: Date
	businessId: string | null
	businessName: string | null
	businessDescription: string | null
	juristicRegistrationNo: string | null
	categoryId: number | null
	address: string | null
	location: number[] | null
	coreBusiness: string | null
	website: string | null
	logoFilePath: string | null
	productFilePath: string | null
	businessCreatedAt: Date | null
	businessUpdatedAt: Date | null
}

export async function getMemberWithBusinessById(sql: Sql, args: GetMemberWithBusinessByIdArgs): Promise<GetMemberWithBusinessByIdRow[]> {
	return (await sql.unsafe(getMemberWithBusinessByIdQuery, [args.id]).values()).map((row) => ({
		id: row[0],
		registrationType: row[1],
		titleNameTh: row[2],
		firstNameTh: row[3],
		lastNameTh: row[4],
		titleNameEn: row[5],
		firstNameEn: row[6],
		lastNameEn: row[7],
		nickname: row[8],
		gender: row[9],
		dateOfBirth: row[10],
		nationality: row[11],
		idCardNo: row[12],
		idCardExpiryDate: row[13],
		memberSince: row[14],
		expiresAt: row[15],
		profileAvatar: row[16],
		phoneNo: row[17],
		email: row[18],
		lineId: row[19],
		shirtSize: row[20],
		positionCode: row[21],
		status: row[22],
		createdAt: row[23],
		updatedAt: row[24],
		businessId: row[25],
		businessName: row[26],
		businessDescription: row[27],
		juristicRegistrationNo: row[28],
		categoryId: row[29],
		address: row[30],
		location: row[31],
		coreBusiness: row[32],
		website: row[33],
		logoFilePath: row[34],
		productFilePath: row[35],
		businessCreatedAt: row[36],
		businessUpdatedAt: row[37],
	}))
}

export const getMemberDocumentsByMemberIdQuery = `-- name: GetMemberDocumentsByMemberId :many
SELECT type, file_path, created_at
FROM member_documents
WHERE member_id = $1
  AND deleted_at IS NULL
  AND type IN ('ID_CARD', 'COMPANY_CERTIFICATE')
ORDER BY type, created_at DESC`

export interface GetMemberDocumentsByMemberIdArgs {
	memberId: string
}

export interface GetMemberDocumentsByMemberIdRow {
	type: string
	filePath: string
	createdAt: Date
}

export async function getMemberDocumentsByMemberId(sql: Sql, args: GetMemberDocumentsByMemberIdArgs): Promise<GetMemberDocumentsByMemberIdRow[]> {
	return (await sql.unsafe(getMemberDocumentsByMemberIdQuery, [args.memberId]).values()).map((row) => ({
		type: row[0],
		filePath: row[1],
		createdAt: row[2],
	}))
}
