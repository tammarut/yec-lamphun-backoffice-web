import { err, ok, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { Member } from "../domain/member"
import type { MemberBusiness } from "../domain/member-business"
import type { MemberDocument } from "../domain/member-document"
import type { PositionCardinality, PositionReadModel } from "../domain/member-read-models"
import type { IMemberRepository, SqlHandle } from "../interfaces"
import { countActiveHolderByPosition, countMemberByIdCardHash, getPositionByCode, insertMember, insertMemberBusiness, insertMemberDocument } from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the members module.
 *
 * Wraps each generated query in {@link ResultAsync.fromPromise} and converts to
 * the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` shape. The insert
 * methods accept domain objects ({@link Member}, {@link MemberBusiness},
 * {@link MemberDocument}) and map their getters to sqlc's generated arg objects
 * internally — so the service passes the aggregate directly with no inline
 * field mapping.
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

	async insertMember(tx: SqlHandle, member: Member) {
		const result = await ResultAsync.fromPromise(
			insertMember(tx as unknown as Sql, {
				registrationType: member.registrationType,
				titleNameTh: member.titleNameTh,
				firstNameTh: member.firstNameTh,
				lastNameTh: member.lastNameTh,
				titleNameEn: member.titleNameEn,
				firstNameEn: member.firstNameEn,
				lastNameEn: member.lastNameEn,
				nickname: member.nickname,
				gender: member.gender,
				dateOfBirth: member.dateOfBirth,
				nationality: member.nationality,
				idCardNo: member.idCardNo,
				idCardNoHash: member.idCardNoHash,
				idCardExpiryDate: member.idCardExpiryDate,
				memberSince: member.memberSince,
				expiresAt: member.expiresAt,
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
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		if (!row) {
			return err(new DatabaseError("insertMember returned no row"))
		}
		// postgres.js returns BIGSERIAL as a string (JS number can't hold all
		// 64-bit ints); convert at this boundary so the domain uses a real number.
		return ok(Number(row.id))
	}

	async insertMemberDocuments(tx: SqlHandle, memberId: number, documents: readonly MemberDocument[]) {
		for (const doc of documents) {
			const result = await ResultAsync.fromPromise(
				insertMemberDocument(tx as unknown as Sql, {
					memberId: String(memberId),
					type: doc.type,
					filePath: doc.filePath,
				}),
				(error) => error as Error
			)
			if (result.isErr()) {
				return err(new DatabaseError(result.error.message, result.error.cause))
			}
		}
		return ok(undefined)
	}

	async insertMemberBusiness(tx: SqlHandle, memberId: number, business: MemberBusiness) {
		const result = await ResultAsync.fromPromise(
			insertMemberBusiness(tx as unknown as Sql, {
				memberId: String(memberId),
				name: business.name,
				description: business.description,
				juristicRegistrationNo: business.juristicRegistrationNo,
				categoryId: business.categoryId,
				address: business.address,
				location: business.location ? [...business.location] : null,
				coreBusiness: business.coreBusiness,
				website: business.website,
				logoFilePath: business.logoFilePath,
				productFilePath: business.productFilePath,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		return ok(undefined)
	}

	async transaction<T>(callback: (tx: SqlHandle) => Promise<T>): Promise<T> {
		return await this.dbClient.transaction(callback)
	}
}
