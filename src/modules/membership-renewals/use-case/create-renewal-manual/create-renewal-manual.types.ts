import type { CreatedRenewalRow } from "../../interfaces"

/**
 * Validated request DTO for POST /api/v1/membership/renewals/manual.
 *
 * `paymentSlip` is the same opaque R2 file-path token as on the public route —
 * returned by POST /api/v1/members/file/upload (field `payment_slip`, private
 * bucket, prefix `members/documents/payment_slip_*`) and trusted as-is at this
 * boundary.
 *
 * `memberIds` is the bulk contract (ADR-0026), identical to the public route's:
 * 1–6 unique positive integers, index 0 = main member (order is client-side
 * display only). Since #85 the manual endpoint takes the SAME array shape — the
 * old singular `member_id` body is gone (breaking change).
 *
 * There is NO `isAdmin` flag here (unlike {@link CreateRenewalRequest} on the
 * public route): the manual route is wrapped in `withAuth`, so by the time the
 * service runs the caller is PROVEN staff. A manual submission is always an
 * Admin Submission; the proof lives in the route's auth contract, not on the
 * DTO. Keeping this pure means the service has no NextRequest/container
 * coupling (mirrors the public service).
 */
export interface CreateManualRenewalRequest {
	/** Target member ids, main member first (already validated 1..6 unique). */
	readonly memberIds: readonly number[]
	/** R2 object key of the uploaded payment slip. */
	readonly paymentSlip: string
}

/**
 * The manual create outcome: one persisted (member_id, renewal_id) pair per
 * member of the submission, in request order, plus the shared Renewal Group
 * marker (ADR-0026) — `null` while the submission is solo (N=1). Same shape as
 * the public route's result: the two endpoints are contract-identical since
 * #85 (the manual rows additionally carry the advanced membership clock).
 */
export interface CreateManualRenewalResult {
	readonly renewals: ReadonlyArray<CreatedRenewalRow>
	readonly groupId: string | null
}
