import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { Member } from "./domain/member"
import type { MemberDetailReadModel, PositionReadModel } from "./domain/member-read-models"
import type { InvalidCursorError } from "./use-case/get-list-members/get-list-members.errors"
import type { ListMembersFilter, MemberListPage } from "./use-case/get-list-members/get-list-members.types"

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

	/**
	 * Paginated, filtered, sorted list of members for the backoffice table
	 * (infinite scroll). Returns one page of rows + `has_more` + `next_cursor`
	 * (computed via the `LIMIT n+1` trick, ADR-0011). Keyset pagination on
	 * `(sort_field, id)`; the cursor's anchor-row sort value is fetched in a
	 * separate cheap lookup, and a missing anchor returns
	 * `err(InvalidCursorError)` → 400 (grilling Q3b / ADR-0011).
	 *
	 * Uses Bun SQL native — this is a dynamic read whose `WHERE`/`ORDER BY`
	 * shape varies at runtime; see ADR-0010 for the sqlc-vs-Bun-SQL split.
	 *
	 * Corrupted members (live member with no live business row) are silently
	 * excluded via an INNER JOIN — the list's job is to render the page, not
	 * to assert the 1:1 invariant per-row; that loudness lives in
	 * `getMemberDetailById` (grilling Q9).
	 */
	getListMembers(filter: ListMembersFilter): Promise<Result<MemberListPage, DatabaseError | InvalidCursorError>>
}
