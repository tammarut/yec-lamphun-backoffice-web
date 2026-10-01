import { err, ok, ResultAsync, type Result } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { toPgArray } from "src/shared/lib/db/pg-serializers"
import { inject, injectable } from "tsyringe"
import type { MemberBusiness } from "../../domain/member-business"
import {
	countLiveMembersByBusinessId,
	findLiveBusinessIdById,
	findLiveJuristicConflictId,
	insertBusiness,
	lockLiveBusinessIdById,
	lockLiveBusinessIdByMemberId,
	softDeleteBusinessById,
	updateBusinessById,
} from "../sql/sqlc-generated/queries_sql"
import type { IBusinessesRepository } from "./interfaces"

/**
 * sqlc-backed repository for the shared `businesses` table (ADR-0024).
 *
 * Wraps the generated queries from the members module's sqlc block (one block
 * per module — the split is at the repository layer, not the sqlc layer) in
 * {@link ResultAsync.fromPromise} and rethrows as DatabaseError so the owning
 * service's transaction auto-rollbacks. Check queries ({@link existsLiveBusiness},
 * {@link findLiveJuristicConflict}) run OUTSIDE any transaction on the
 * repository's own connection and return the §2B Result shape; all other
 * methods are tx-scoped (they take the service's transaction handle).
 * BIGSERIAL ids arrive as strings and are numbered at this boundary.
 */
@injectable()
export class BusinessesRepository implements IBusinessesRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async existsLiveBusiness(businessId: number): Promise<Result<boolean, DatabaseError>> {
		const result = await ResultAsync.fromPromise(findLiveBusinessIdById(this.sql, { id: String(businessId) }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		return ok(result.value.length > 0)
	}

	async lockLiveBusinessById(sql: Sql, businessId: number): Promise<number | null> {
		const result = await ResultAsync.fromPromise(lockLiveBusinessIdById(sql, { id: String(businessId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		const row = result.value[0]
		if (!row) {
			return null
		}
		return Number(row.id)
	}

	async findLiveJuristicConflict(juristicRegistrationNo: string, excludeBusinessId: number | null): Promise<Result<number | null, DatabaseError>> {
		const result = await ResultAsync.fromPromise(
			findLiveJuristicConflictId(this.sql, { juristicRegistrationNo, excludeBusinessId: excludeBusinessId === null ? null : String(excludeBusinessId) }),
			(error) => error as Error
		)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		if (!row) {
			return ok(null)
		}
		return ok(Number(row.id))
	}

	async insertBusiness(sql: Sql, business: MemberBusiness): Promise<number> {
		const result = await ResultAsync.fromPromise(
			insertBusiness(sql, {
				name: business.name,
				description: business.description,
				juristicRegistrationNo: business.juristicRegistrationNo,
				categoryId: business.categoryId,
				address: business.address,
				// Bun.SQL serializes JS arrays via toString() → "100.5,13.7" which
				// Postgres rejects as a malformed array literal; convert to the
				// Postgres array-literal format "{100.5,13.7}".
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
		const row = result.value[0]
		if (!row) {
			throw new DatabaseError("insertBusiness returned no row")
		}
		// postgres.js returns BIGSERIAL as a string; convert at this boundary.
		return Number(row.id)
	}

	async updateBusinessById(sql: Sql, businessId: number, business: MemberBusiness): Promise<void> {
		const result = await ResultAsync.fromPromise(
			updateBusinessById(sql, {
				id: String(businessId),
				name: business.name,
				description: business.description,
				juristicRegistrationNo: business.juristicRegistrationNo,
				categoryId: business.categoryId,
				address: business.address,
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

	async lockLiveBusinessIdByMemberId(sql: Sql, memberId: number): Promise<number | null> {
		const result = await ResultAsync.fromPromise(lockLiveBusinessIdByMemberId(sql, { id: String(memberId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		const row = result.value[0]
		if (!row) {
			return null
		}
		return Number(row.businessId)
	}

	async countLiveMembersByBusinessId(sql: Sql, businessId: number, excludeMemberId: number): Promise<number> {
		const result = await ResultAsync.fromPromise(countLiveMembersByBusinessId(sql, { businessId: String(businessId), id: String(excludeMemberId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		const row = result.value[0]
		if (!row) {
			throw new DatabaseError("countLiveMembersByBusinessId returned no row")
		}
		return row.liveCount
	}

	async softDeleteBusinessById(sql: Sql, businessId: number): Promise<void> {
		const result = await ResultAsync.fromPromise(softDeleteBusinessById(sql, { id: String(businessId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}
