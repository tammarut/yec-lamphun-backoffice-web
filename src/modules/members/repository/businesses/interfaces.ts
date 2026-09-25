import type { Sql } from "postgres"
import type { MemberBusiness } from "../../domain/member-business"

/**
 * Repository contract for the shared `businesses` table (ADR-0024): its
 * write-side persistence plus the whole ADR-0023 delete-cascade boundary,
 * split out of IMemberRepository so each repository matches one table's
 * responsibility.
 *
 * Every method is a TRANSACTION-SCOPED step: it takes the calling service's
 * `tx` handle and THROWS DatabaseError on failure, so the service's
 * `DatabaseClient.transaction` auto-rollbacks (the tx-internal style shared by
 * all multi-table flows since ADR-0023/0024 — services own transactions,
 * repositories execute SQL). Read JOINs that project business columns onto
 * member-centric queries stay in MembersRepository (ADR-0024).
 */
export interface IBusinessesRepository {
	/**
	 * Insert a shared business row and return the generated id (BIGSERIAL →
	 * number). Runs FIRST in the create transaction — the member insert consumes
	 * this id as its NOT NULL business_id. `business.location` must arrive
	 * already swapped to [long, lat] (the MemberBusiness VO owns the swap).
	 */
	insertBusiness(tx: Sql, business: MemberBusiness): Promise<number>

	/**
	 * Wholesale-overwrite the shared row (ADR-0023: every linked member sees the
	 * edit). logo/product stickiness is guaranteed by the caller resolving
	 * null-sticky paths upstream (ADR-0012). `WHERE deleted_at IS NULL` makes a
	 * racing soft-delete a 0-row no-op (last-writer-wins, grilling Q11).
	 */
	updateBusinessById(tx: Sql, businessId: number, business: MemberBusiness): Promise<void>

	/**
	 * Lock (SELECT ... FOR UPDATE) the member's linked LIVE business row and
	 * return its id — the ADR-0023 cascade gate. Returns `null` when the
	 * business is already soft-deleted/absent: a re-delete then skips the
	 * cascade entirely (idempotent 204, never 404). The lock is held until the
	 * transaction ends and serializes concurrent deletes of co-linked members.
	 * Locking assumption: business_id is immutable post-creation (see the
	 * locking note on FindLiveBusinessIdForCascade in the members queries.sql).
	 */
	findLiveBusinessIdForCascade(tx: Sql, memberId: number): Promise<number | null>

	/**
	 * Count live members still linked to the business, excluding
	 * `excludeMemberId` (the deleting member). The exclusion is belt-and-braces:
	 * the caller soft-deletes the member row BEFORE counting, so the
	 * `deleted_at IS NULL` filter already excludes them — the id exclusion keeps
	 * the count correct even if the step order is ever rearranged. 0 ⇒ the
	 * caller fires {@link softDeleteBusinessById} (ADR-0023 last-live-link rule).
	 */
	countLiveMembersByBusinessId(tx: Sql, businessId: number, excludeMemberId: number): Promise<number>

	/** Soft-delete the shared business row (ADR-0023: businesses do not survive their last live member). */
	softDeleteBusinessById(tx: Sql, businessId: number): Promise<void>
}
