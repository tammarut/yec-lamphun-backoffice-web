import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member } from "./domain/member"
import type { PositionReadModel } from "./domain/member-read-models"

export interface IMemberRepository {
	// --- Check queries (run OUTSIDE the create-member transaction) ----------

	/** Count non-deleted members matching the id_card blind index. >0 = duplicate. */
	countMemberByIdCardHash(idCardNoHash: string): Promise<Result<number, DatabaseError>>

	/** Fetch a position by code, including cardinality (for the conflict policy). */
	getPositionByCode(code: string): Promise<Result<PositionReadModel | null, DatabaseError>>

	/** Count non-deleted members currently holding a position. */
	countActiveHolderByPosition(positionCode: string): Promise<Result<number, DatabaseError>>

	// --- Writes -------------------------------------------------------------

	/**
	 * Persist a new member atomically: inserts the member row, its documents,
	 * and its business record inside a single database transaction. Returns the
	 * generated member id. The transaction + multi-table insert is an internal
	 * implementation detail — callers see one method.
	 */
	create(member: Member): Promise<Result<number, DatabaseError>>
}
