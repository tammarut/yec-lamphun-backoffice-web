import { err, ok, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { IMembershipRenewalRepository } from "../interfaces"
import { PendingRenewalExistsError } from "../use-case/create-renewal/create-renewal.errors"
import { getMemberStatusForRenewal, insertMembershipRenewal, updateMemberStatusOnRenewal } from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the membership-renewals module.
 *
 * Owns the create-renewal cross-table transaction (ADR-0014): inside one tx it
 * INSERTs the renewal row and UPDATEs the member's Renewal Cache Columns. This
 * is the second repository (after MembersRepository) that writes another
 * module's table — justified because the member cache columns are a
 * denormalized mirror OF the renewal's own state, so the renewal aggregate's
 * repository is the natural owner of the write. Mirrors MembersRepository's
 * shape: each generated call is wrapped in {@link ResultAsync.fromPromise} and
 * converted to the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` form.
 *
 * The INSERT helper inspects the Postgres error code on failure — the first
 * pg-code inspection in this codebase — mapping 23505 (unique_violation from
 * idx_one_pending_renewal_per_member) to PendingRenewalExistsError and all
 * other failures to DatabaseError.
 */
@injectable()
export class MembershipRenewalsRepository implements IMembershipRenewalRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async getMemberStatusForRenewal(memberId: number) {
		const result = await ResultAsync.fromPromise(getMemberStatusForRenewal(this.sql, { id: String(memberId) }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		// No row → not found or soft-deleted; the service narrows null → 404.
		return ok(row ? row.status : null)
	}

	async createRenewal(memberId: number, paymentSlipFilePath: string) {
		// The transaction is scoped to this method: insert renewal → update member
		// cache columns. bun:sql auto-commits on success, auto-rollbacks on throw.
		try {
			const renewalId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				const newId = await this.doInsertRenewal(sql, memberId, paymentSlipFilePath)
				await this.doUpdateMemberStatus(sql, memberId)
				return newId
			})

			return ok(renewalId)
		} catch (error) {
			// doInsertRenewal may throw a PendingRenewalExistsError on pg code 23505;
			// propagate it as-is so the route maps to 409. Everything else (including
			// any DatabaseError thrown by the helpers) is a DatabaseError → 500.
			if (error instanceof PendingRenewalExistsError) {
				return err(error)
			}
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Create renewal transaction failed", error))
		}
	}

	// --- Private helpers (run inside createRenewal's transaction) ----------

	/**
	 * Insert the renewal row and return the generated id. Throws
	 * {@link PendingRenewalExistsError} on Postgres unique_violation (code 23505)
	 * from idx_one_pending_renewal_per_member — the partial unique index that
	 * enforces one PENDING_REVIEW renewal per member. Throwing inside the tx
	 * triggers bun:sql's auto-rollback. Any other failure → DatabaseError.
	 *
	 * This is the only place in the codebase that inspects a Postgres error code;
	 * the inspection is sealed inside this helper so the pg-error-detail pattern
	 * does not leak into the service layer.
	 */
	private async doInsertRenewal(sql: Sql, memberId: number, paymentSlipFilePath: string): Promise<number> {
		try {
			const result = await insertMembershipRenewal(sql, {
				memberId: String(memberId),
				paymentSlipFilePath,
			})
			const row = result[0]
			if (!row) {
				throw new DatabaseError("insertMembershipRenewal returned no row")
			}
			// BIGSERIAL comes back as a string; convert at this boundary.
			return Number(row.id)
		} catch (error) {
			// bun:sql surfaces unique_violation as a PostgresError carrying `.code`.
			// postgres.js does the same (its PostgresError also has `.code`). Either
			// driver reaches this branch with code "23505"; the partial unique index
			// idx_one_pending_renewal_per_member is the only such index on this table.
			if (isUniqueViolation(error)) {
				throw new PendingRenewalExistsError(undefined, error)
			}
			if (error instanceof DatabaseError) {
				throw error
			}
			throw new DatabaseError(error instanceof Error ? error.message : "Insert membership renewal failed", error)
		}
	}

	/**
	 * Update the member's Renewal Cache Columns (status, latest_renewal_status)
	 * inside the same transaction. Carries `deleted_at IS NULL` (encoded in the
	 * generated SQL) matching every other members write query.
	 */
	private async doUpdateMemberStatus(sql: Sql, memberId: number): Promise<void> {
		const result = await ResultAsync.fromPromise(updateMemberStatusOnRenewal(sql, { id: String(memberId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}

/**
 * Narrows a thrown value to a Postgres unique_violation (error code 23505).
 *
 * Both bun:sql (`SQL.PostgresError extends SQLError`) and postgres.js
 * (`PostgresError`) surface the SQLSTATE on a readonly `.code` string property.
 * We check for that property rather than `instanceof` a driver-specific class so
 * the guard works under either driver without importing a type that may not
 * exist at runtime in this build.
 */
function isUniqueViolation(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505"
}
