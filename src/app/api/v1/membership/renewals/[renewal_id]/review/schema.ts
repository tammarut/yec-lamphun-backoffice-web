import { check, object, optional, nullable, picklist, pipe, string, type InferOutput } from "valibot"

/**
 * Structural + cross-field request schema for
 * PATCH /api/v1/membership/renewals/{renewal_id}/review.
 *
 * Two depths, both owned here because both are pure functions of the request
 * body (ADR-0018):
 *
 * - Structural: `status` is the APPROVED | REJECTED decision; `reason` is an
 *   optional, nullable plain string (NO max length — the column is TEXT and the
 *   spec sets no bound; the only length rule is the pairing below).
 * - Cross-field pairing, the spec's validation rule verbatim: REJECTED requires
 *   a non-empty reason, APPROVED requires none. Trim-aware, symmetrically — a
 *   whitespace-only reason counts as empty in BOTH directions (it carries no
 *   information; on approve the reason is discarded regardless).
 *   Violations return the spec's literal message
 *   "status and reason are incorrect" → 400.
 *
 * The route (not this schema) validates the `renewal_id` path param. Semantic
 * rules requiring state (renewal exists, still PENDING_REVIEW) live in the
 * domain/service — never here.
 */
export const ReviewRenewalSchema = pipe(
	object({
		status: picklist(["APPROVED", "REJECTED"], "status must be APPROVED or REJECTED"),
		reason: optional(nullable(string())),
	}),
	check(
		(input) => (input.status === "REJECTED" ? typeof input.reason === "string" && input.reason.trim().length > 0 : input.reason == null || input.reason.trim().length === 0),
		"status and reason are incorrect"
	)
)

export type ReviewRenewalSchemaOutput = InferOutput<typeof ReviewRenewalSchema>
