import { err, ok, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { Member } from "../domain/member"
import type { MemberBusiness } from "../domain/member-business"
import type { MemberDocument } from "../domain/member-document"
import type { PositionCardinality, PositionReadModel } from "../domain/member-read-models"
import type { IMemberRepository } from "../interfaces"
import { countActiveHolderByPosition, countMemberByIdCardHash, getPositionByCode, insertMember, insertMemberBusiness, insertMemberDocument } from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the members module.
 *
 * Wraps each generated query in {@link ResultAsync.fromPromise} and converts to
 * the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` shape. The
 * {@link create} method owns the transaction and the multi-table insert
 * (members → documents → business) as a single atomic unit; the individual
 * inserts are private helpers, invisible to the service.
 */
@injectable()
export class MembersRepository implements IMemberRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async countMemberByIdCardHash(idCardNoHash: string) {
		const result = await ResultAsync.fromPromise(countMemberByIdCardHash(this.sql, { idCardNoHash }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		return ok(row ? row.count : 0)
	}

	async getPositionByCode(code: string) {
		const result = await ResultAsync.fromPromise(getPositionByCode(this.sql, { code }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		if (!row) {
			return ok(null)
		}
		return ok({
			code: row.code,
			nameTh: row.nameTh,
			nameEn: row.nameEn,
			cardinality: row.cardinality as PositionCardinality,
			parentPositionCode: row.parentPositionCode,
			displayOrder: row.displayOrder,
			isActive: row.isActive,
		} satisfies PositionReadModel)
	}

	async countActiveHolderByPosition(positionCode: string) {
		const result = await ResultAsync.fromPromise(countActiveHolderByPosition(this.sql, { positionCode }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		return ok(row ? row.count : 0)
	}

	async create(member: Member) {
		// The transaction is scoped to this method: insert member → documents →
		// business. bun:sql auto-commits on success, auto-rollbacks on any throw.
		try {
			const memberId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				const memberId = await this.doInsertMember(sql, member)
				if (member.documents.length > 0) {
					await this.doInsertDocuments(sql, memberId, member.documents)
				}
				await this.doInsertBusiness(sql, memberId, member.business)

				return memberId
			})

			return ok(memberId)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Member creation transaction failed", error))
		}
	}

	// --- Private insert helpers (run inside create's transaction) ----------

	/** Insert the member row, return the generated id as a number. */
	private async doInsertMember(sql: Sql, member: Member): Promise<number> {
		const result = await ResultAsync.fromPromise(
			insertMember(sql, {
				registrationType: member.registrationType,
				titleNameTh: member.titleNameTh,
				firstNameTh: member.firstNameTh,
				lastNameTh: member.lastNameTh,
				titleNameEn: member.titleNameEn,
				firstNameEn: member.firstNameEn,
				lastNameEn: member.lastNameEn,
				nickname: member.nickname,
				gender: member.gender,
				// Bun.SQL serializes Date via toString() → "GMT+0700" which Postgres
				// rejects; toISOString() → UTC ISO 8601 which Postgres accepts.
				// Cast through unknown because the sqlc-generated type expects Date,
				// but the driver actually wants a string here.
				dateOfBirth: toPgDate(member.dateOfBirth) as unknown as Date,
				nationality: member.nationality,
				idCardNo: member.idCardNo,
				idCardNoHash: member.idCardNoHash,
				idCardExpiryDate: toPgDate(member.idCardExpiryDate) as unknown as Date,
				memberSince: toPgDate(member.memberSince) as unknown as Date,
				expiresAt: toPgDate(member.expiresAt) as unknown as Date,
				profileAvatar: member.profileAvatar,
				phoneNo: member.phoneNo,
				email: member.email,
				lineId: member.lineId,
				shirtSize: member.shirtSize,
				positionCode: member.positionCode,
				status: member.status,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		const row = result.value[0]
		if (!row) {
			throw new DatabaseError("insertMember returned no row")
		}
		// postgres.js returns BIGSERIAL as a string; convert at this boundary.
		return Number(row.id)
	}

	/** Insert one row per document value object. */
	private async doInsertDocuments(sql: Sql, memberId: number, documents: readonly MemberDocument[]): Promise<void> {
		for (const doc of documents) {
			const result = await ResultAsync.fromPromise(
				insertMemberDocument(sql, {
					memberId: String(memberId),
					type: doc.type,
					filePath: doc.filePath,
				}),
				(error) => error as Error
			)
			if (result.isErr()) {
				throw new DatabaseError(result.error.message, result.error.cause)
			}
		}
	}

	/** Insert the business record from its value object. */
	private async doInsertBusiness(sql: Sql, memberId: number, business: MemberBusiness): Promise<void> {
		const result = await ResultAsync.fromPromise(
			insertMemberBusiness(sql, {
				memberId: String(memberId),
				name: business.name,
				description: business.description,
				juristicRegistrationNo: business.juristicRegistrationNo,
				categoryId: business.categoryId,
				address: business.address,
				// Bun.SQL serializes JS arrays via toString() → "100.5,13.7" which
				// Postgres rejects as a malformed array literal. Convert to the
				// Postgres array literal format "{100.5,13.7}".
				location: toPgArray(business.location) as unknown as number[] | null,
				coreBusiness: business.coreBusiness,
				website: business.website,
				logoFilePath: business.logoFilePath,
				productFilePath: business.productFilePath,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}

/**
 * Convert a JS Date to a Postgres-safe ISO 8601 string.
 *
 * Bun.SQL serializes Date objects via Date.toString(), which produces a local-
 * timezone string like "2026-01-15 10:00:00 GMT+0700". Postgres does not
 * recognize the "GMT+0700" format and rejects it. Converting to ISO 8601
 * (UTC, "Z" suffix) makes Postgres accept it for both DATE and TIMESTAMPTZ
 * columns. Null passes through for nullable date columns.
 */
function toPgDate(date: Date | null): string | null {
	if (date === null) {
		return null
	}

	return date.toISOString()
}

/**
 * Convert a JS number array to a Postgres array literal string.
 *
 * Bun.SQL serializes JS arrays via Array.toString() → "100.5,13.7", which
 * Postgres rejects as a malformed array literal. The correct format is the
 * Postgres array literal "{100.5,13.7}". Null passes through for nullable
 * array columns.
 */
function toPgArray(arr: readonly number[] | null): string | null {
	if (arr === null) {
		return null
	}

	return `{${arr.join(",")}}`
}
