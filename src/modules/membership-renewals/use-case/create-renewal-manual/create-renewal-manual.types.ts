/**
 * Validated request DTO for POST /api/v1/membership/renewals/manual.
 *
 * `paymentSlip` is the same opaque R2 file-path token as on the public route —
 * returned by POST /api/v1/members/file/upload (field `payment_slip`, private
 * bucket, prefix `members/documents/payment_slip_*`) and trusted as-is at this
 * boundary.
 *
 * There is NO `isAdmin` flag here (unlike {@link CreateRenewalRequest} on the
 * public route): the manual route is wrapped in `withAuth`, so by the time the
 * service runs the caller is PROVEN staff. A manual submission is always an
 * Admin Submission; the proof lives in the route's auth contract, not on the
 * DTO. Keeping this pure means the service has no NextRequest/container
 * coupling (mirrors the public service).
 */
export interface CreateManualRenewalRequest {
	/** Target member id (arrives in the JSON body as `member_id`). */
	readonly memberId: number
	/** R2 object key of the uploaded payment slip. */
	readonly paymentSlip: string
}
