import type { Sql } from "postgres"
import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { MemberBusiness } from "../../domain/member-business"
import type { BusinessSearchFilter, BusinessSearchItem } from "../../use-case/search-businesses/search-businesses.types"

/**
 * Repository contract for the shared `businesses` table (ADR-0024): its
 * write-side persistence plus the whole ADR-0023 delete-cascade boundary,
 * split out of IMemberRepository so each repository matches one table's
 * responsibility.
 *
 * Check queries (the #69 link/juristic pre-checks) run OUTSIDE any transaction
 * and return the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` shape, same
 * as the member duplicate/contact checks in IMemberRepository.
 *
 * Every other method is a TRANSACTION-SCOPED step: it takes the calling
 * service's `tx` handle and THROWS DatabaseError on failure, so the service's
 * `DatabaseClient.transaction` auto-rollbacks (the tx-internal style shared by
 * all multi-table flows since ADR-0023/0024 — services own transactions,
 * repositories execute SQL). Read JOINs that project business columns onto
 * member-centric queries stay in MembersRepository (ADR-0024).
 */
export interface IBusinessesRepository {
	// --- Check queries (run OUTSIDE any transaction) -------------------------

	/**
	 * Whether a LIVE (non-deleted) business row exists with this id — the
	 * link/re-link branch's business_id validation (#69): unknown or
	 * soft-deleted → the service maps to a 400. Pre-check only; the tx-scoped
	 * {@link lockLiveBusinessById} re-checks with a lock before any write.
	 */
	existsLiveBusiness(businessId: number): Promise<Result<boolean, DatabaseError>>

	/**
	 * Lock (SELECT ... FOR UPDATE) a LIVE business row by id and return it —
	 * the tx-scoped liveness re-check for the link/re-link TARGET (#69). Runs
	 * INSIDE the owning service's transaction, after the outside-tx pre-check:
	 * the lock serializes against a concurrent ADR-0023 delete-cascade of this
	 * business, closing the pre-check race. `null` ⇒ the target was
	 * soft-deleted between check and lock (or is absent) ⇒ the caller aborts
	 * with DatabaseError instead of writing a live member onto a dead business.
	 */
	lockLiveBusinessById(tx: Sql, businessId: number): Promise<number | null>

	/**
	 * The id of a LIVE business holding this juristic_registration_no, or null —
	 * the create/edit branch's collision check (#62 D3). `excludeBusinessId`
	 * null = create flow (any live business conflicts); a value = PATCH edit
	 * flow, excluding the member's own linked business (self-excluding). This is
	 * the businesses-side mirror of FindLiveContactConflicts; the partial unique
	 * index idx_businesses_juristic_registration_no is the DB-side guard.
	 */
	findLiveJuristicConflict(juristicRegistrationNo: string, excludeBusinessId: number | null): Promise<Result<number | null, DatabaseError>>

	// --- Tx-scoped steps ------------------------------------------------------

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
	 * return its id. Two callers, one guarantee — the lock is held until the
	 * transaction ends:
	 *   1. the ADR-0023 delete-cascade gate — serializes concurrent deletes of
	 *      co-linked members. Returns `null` when the business is already
	 *      soft-deleted/absent: a re-delete then skips the cascade entirely
	 *      (idempotent 204, never 404).
	 *   2. the #69 re-link release step — serializes against concurrent
	 *      delete-cascades and other re-links releasing the same old business.
	 * The lock order is member-row first (subquery FOR UPDATE), then business —
	 * required since #69 made business_id mutable (UpdateMemberBusinessLinkById);
	 * without it a concurrent re-link and a delete-cascade can deadlock.
	 * Locking assumption: between this lock and the caller's re-point, the
	 * member's business_id cannot change — any concurrent re-link of the SAME
	 * member blocks on this tx's member-row lock (and re-evaluates the fresh
	 * business_id after the wait).
	 */
	lockLiveBusinessIdByMemberId(tx: Sql, memberId: number): Promise<number | null>

	/**
	 * Count live members still linked to the business, excluding
	 * `excludeMemberId` (the deleting/re-linking member). The exclusion is
	 * belt-and-braces: the delete-cascade caller soft-deletes the member row
	 * BEFORE counting, and the re-link caller has already re-pointed the member,
	 * so the `deleted_at IS NULL`/`business_id` filters already exclude them —
	 * the id exclusion keeps the count correct even if the step order is ever
	 * rearranged. 0 ⇒ the caller fires {@link softDeleteBusinessById} (ADR-0023
	 * last-live-link rule).
	 */
	countLiveMembersByBusinessId(tx: Sql, businessId: number, excludeMemberId: number): Promise<number>

	/** Soft-delete the shared business row (ADR-0023: businesses do not survive their last live member). */
	softDeleteBusinessById(tx: Sql, businessId: number): Promise<void>
}

/**
 * Repository contract for the #68 business search read: the prefix-search
 * picker over LIVE businesses. Split out of {@link IBusinessesRepository}
 * (one repository per responsibility, ADR-0024) so the write-side + cascade
 * boundary stays untouched. Runs OUTSIDE any transaction on its own
 * connection and returns the AGENTS.md §2B `Promise<Result<...>>` shape, same
 * as the check queries above.
 */
export interface IBusinessSearchRepository {
	/**
	 * Live businesses matching the filter, ordered by name then id, capped at
	 * `filter.limit` (already defaulted by the route). `search` null = no
	 * filter; a non-empty value is an escaped prefix-ILIKE over the business
	 * name AND juristic_registration_no (escaping happens app-side in the
	 * repository, never in SQL). Each row carries its live-member rollup —
	 * see {@link BusinessSearchItem}.
	 */
	searchLiveBusinesses(filter: BusinessSearchFilter): Promise<Result<readonly BusinessSearchItem[], DatabaseError>>
}
