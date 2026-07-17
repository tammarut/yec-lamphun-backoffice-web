import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member } from "./domain/member"
import type { MemberDetailReadModel, PositionReadModel } from "./domain/member-read-models"

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

	// --- Reads --------------------------------------------------------------

	/**
	 * Fetch a non-deleted member's detail (member + 1:1 business + latest-wins
	 * ID_CARD/COMPANY_CERTIFICATE documents) by id.
	 *
	 * Returns `null` when the member does not exist or is soft-deleted (the route
	 * maps both to 404, indistinguishable). Returns `err(DatabaseError)` when a
	 * live member has no live business row — that case is impossible via the
	 * create flow (business insert is unconditional + atomic), so it signals
	 * out-of-band corruption and the route maps it to 500 (grilling Q6/iii-a).
	 */
	getMemberDetailById(id: number): Promise<Result<MemberDetailReadModel | null, DatabaseError>>
}
