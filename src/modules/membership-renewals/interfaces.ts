import type { Result } from "neverthrow"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { PendingRenewalExistsError } from "./use-case/create-renewal/create-renewal.errors"

/**
 * Repository contract for the membership-renewals module.
 *
 * The create-renewal flow is split across two methods mirroring the create-member
 * convention (grilling Q2): a cheap READ for the service-side status pre-check
 * (outside the transaction), and a WRITE that owns the cross-table transaction
 * (ADR-0014). The service orchestrates the 404/403/409 domain decisions; the
 * repository owns atomicity and the Postgres 23505 catch.
 */
export interface IMembershipRenewalRepository {
	/**
	 * Pre-check read (runs OUTSIDE the create-renewal transaction): fetch the
	 * member's current status for the service's 404/403/409 early-exit branches.
	 *
	 * Returns `null` when the member does not exist or is soft-deleted (the two
	 * are indistinguishable to the client → 404). Returns the status string
	 * otherwise (e.g. "ACTIVE", "RESIGNED", "PENDING_RENEWAL").
	 */
	getMemberStatusForRenewal(memberId: number): Promise<Result<string | null, DatabaseError>>

	/**
	 * Atomically create a renewal and update the member's Renewal Cache Columns
	 * in one transaction (ADR-0014). The status values are passed in (not
	 * hardcoded) so one method serves both submission kinds (ADR-0015):
	 *   1. INSERT INTO membership_renewals (..., $renewalStatus) RETURNING id
	 *   2. UPDATE members SET status=$memberStatus,
	 *      latest_renewal_status=$renewalStatus WHERE id AND deleted_at IS NULL
	 *
	 * The caller (service) selects the pair from the submission kind:
	 *   public  -> renewalStatus='PENDING_REVIEW', memberStatus='PENDING_RENEWAL'
	 *   admin   -> renewalStatus='APPROVED',       memberStatus='ACTIVE'
	 *
	 * The partial unique index idx_one_pending_renewal_per_member covers
	 * status='PENDING_REVIEW' ONLY, so a public insert may hit Postgres code
	 * 23505 under a race that beats the pre-check; this method catches that code
	 * and returns `err(PendingRenewalExistsError)` (→ 409). An admin insert
	 * ('APPROVED') is excluded from the index and cannot 23505. All other DB
	 * failures map to `err(DatabaseError)`. On success returns `ok(newRenewalId)`.
	 */
	createRenewal(memberId: number, paymentSlipFilePath: string, renewalStatus: string, memberStatus: string): Promise<Result<number, PendingRenewalExistsError | DatabaseError>>
}
