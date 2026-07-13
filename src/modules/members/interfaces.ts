import type { SQL } from "bun"
import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member } from "./domain/member"
import type { MemberBusiness } from "./domain/member-business"
import type { MemberDocument } from "./domain/member-document"
import type { PositionReadModel } from "./domain/member-read-models"

/**
 * A transaction or connection handle from Bun's SQL client. The repository
 * accepts this for insert methods so the service can run all inserts inside
 * one atomic transaction. The repository implementation casts it to the
 * sqlc-generated `Sql` type (postgres.js) when invoking generated functions.
 */
export type SqlHandle = SQL

export interface IMemberRepository {
	// --- Check queries (run OUTSIDE the create-member transaction) ----------

	/** Count non-deleted members matching the id_card blind index. >0 = duplicate. */
	countMemberByIdCardHash(idCardNoHash: string): Promise<Result<number, DatabaseError>>

	/** Fetch a position by code, including cardinality (for the conflict policy). */
	getPositionByCode(code: string): Promise<Result<PositionReadModel | null, DatabaseError>>

	/** Count non-deleted members currently holding a position. */
	countActiveHolderByPosition(positionCode: string): Promise<Result<number, DatabaseError>>

	// --- Inserts (run INSIDE the create-member transaction) ------------------

	/**
	 * Insert a member row from the aggregate and return the generated id.
	 * The repository maps the Member's getters to the generated arg object.
	 */
	insertMember(tx: SqlHandle, member: Member): Promise<Result<number, DatabaseError>>

	/** Insert document rows for a member from their value objects. */
	insertMemberDocuments(tx: SqlHandle, memberId: number, documents: readonly MemberDocument[]): Promise<Result<void, DatabaseError>>

	/** Insert the member's business record from its value object. */
	insertMemberBusiness(tx: SqlHandle, memberId: number, business: MemberBusiness): Promise<Result<void, DatabaseError>>

	// --- Transaction control ------------------------------------------------

	/** Run a callback inside a DB transaction. Auto-commits on success, rolls back on throw. */
	transaction<T>(callback: (tx: SqlHandle) => Promise<T>): Promise<T>
}
