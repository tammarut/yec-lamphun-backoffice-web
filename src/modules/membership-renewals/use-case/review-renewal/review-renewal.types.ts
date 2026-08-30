import type { ReviewDecision } from "../../domain/membership-renewal"

/**
 * Validated request DTO for PATCH /api/v1/membership/renewals/review/{renewal_id}.
 *
 * `renewalId` arrives as the path parameter (already a positive integer by the
 * time this exists). `decision` is the review verdict; `reason` is the rejection
 * reason. The status/reason pairing (REJECTED requires a non-empty reason,
 * APPROVED forbids one) is enforced at the ROUTE boundary by the Valibot schema
 * (ADR-0018) — a pure function of the request body — so this DTO is always
 * internally consistent and the domain's `review()` does not re-check it.
 *
 * There is no reviewer field: the reviewer's identity is not recorded (ADR-0018,
 * known gap) — only `reviewed_at` is stamped, by the repository's SQL.
 */
export interface ReviewRenewalRequest {
	/** Target renewal id (path parameter `renewal_id`). */
	readonly renewalId: number
	/** The review verdict: approve or reject. */
	readonly decision: ReviewDecision
	/** Rejection reason — non-null only when decision is REJECTED. */
	readonly reason: string | null
}
