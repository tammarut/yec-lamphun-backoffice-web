/**
 * Validated request DTO for POST /api/v1/membership/renewals.
 *
 * `paymentSlip` is an opaque R2 file-path token returned by
 * POST /api/v1/members/file/upload (field `payment_slip`, private bucket, prefix
 * `members/documents/payment_slip_*`). It is trusted as-is at this boundary —
 * same stance as every file-path field in create-member (id_card_image, etc.):
 * the upload endpoint owns the path's shape; this endpoint stores the reference.
 */
export interface CreateRenewalRequest {
	/** Target member id (path-independent here — arrives in the JSON body). */
	readonly memberId: number
	/** R2 object key of the uploaded payment slip. */
	readonly paymentSlip: string
}
