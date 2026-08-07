/**
 * Validated request DTO for POST /api/v1/membership/renewals.
 *
 * `paymentSlip` is an opaque R2 file-path token returned by
 * POST /api/v1/members/file/upload (field `payment_slip`, private bucket, prefix
 * `members/documents/payment_slip_*`). It is trusted as-is at this boundary —
 * same stance as every file-path field in create-member (id_card_image, etc.):
 * the upload endpoint owns the path's shape; this endpoint stores the reference.
 *
 * `isAdmin` selects the submission kind (ADR-0015): true for an Admin Submission
 * (valid staff session cookie → APPROVED/ACTIVE), false for a Public Submission
 * (no/invalid cookie → PENDING_REVIEW/PENDING_RENEWAL). Decided in the route
 * (the only layer that touches the cookie) and passed down as a plain boolean,
 * keeping the service pure (no NextRequest/container coupling).
 */
export interface CreateRenewalRequest {
	/** Target member id (path-independent here — arrives in the JSON body). */
	readonly memberId: number
	/** R2 object key of the uploaded payment slip. */
	readonly paymentSlip: string
	/**
	 * Whether the caller is a staff member with a valid session — true only when
	 * the route resolved a valid session_id cookie. Selects the status pair:
	 * true → APPROVED/ACTIVE (Admin Submission), false → PENDING_REVIEW/PENDING_RENEWAL.
	 */
	readonly isAdmin: boolean
}
