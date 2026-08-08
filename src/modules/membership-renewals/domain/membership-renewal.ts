import { ok, type Result } from "neverthrow"
import { computeMembershipExpiry } from "src/modules/shared/membership/membership-expiry"

/**
 * The Renewal Status of a single Membership Renewal.
 *
 * `PENDING_REVIEW` is the entry point for a Public Submission; `APPROVED` is the
 * entry point for an Admin Submission (instant approval, ADR-0015). `REJECTED` is
 * a terminal state set only by the future review API. Mirrors the
 * `chk_membership_renewals_status` CHECK constraint verbatim.
 */
export type RenewalStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED"

/**
 * The Member Status the create-renewal flow writes back to `members.status` as a
 * Renewal Cache Column. `PENDING_RENEWAL` for a Public Submission, `ACTIVE` for
 * an Admin Submission. (The full `members.status` union also includes EXPIRED /
 * RESIGNED, but those are never *written* by this flow, so this type is the
 * write-only subset — matches `chk_members_status`.)
 */
export type MemberStatusOnRenewal = "PENDING_RENEWAL" | "ACTIVE"

/**
 * Concrete property bag for a fully-resolved Membership Renewal ready to persist.
 *
 * `paymentDateAt` is always server-`NOW()` (the client never sends it). `status`
 * is selected from the submission kind (ADR-0015). There are no value objects
 * today — `paymentSlipFilePath` is an opaque R2 token trusted from the upload
 * endpoint; `memberId` is a positive integer already validated at the route.
 * When the review API lands, this is where a `reviewedAt` / `reviewer` /
 * transition-state VO would go.
 */
export type MembershipRenewalProps = {
	readonly memberId: number
	readonly paymentSlipFilePath: string
	readonly paymentDateAt: Date
	readonly status: RenewalStatus
	/** The member cache-column value to write alongside this renewal. */
	readonly memberStatusOnRenewal: MemberStatusOnRenewal
	/**
	 * The new `members.expires_at` to write, present ONLY on a Manual Renewal
	 * Submission (created via {@link MembershipRenewal.createManual}). Absent on
	 * the public path — the public create-renewal flow deliberately does not
	 * touch `expires_at` (ADR-0015); ADR-0016 assigns the clock-advancing write
	 * to the manual endpoint. Undefined here means "not applicable".
	 */
	readonly expiresAt?: Date
}

/**
 * A fully-resolved, persistence-ready Membership Renewal.
 *
 * Constructed exclusively through {@link create} (resolves the status pair from
 * the submission kind) — there is no `fromDb` yet because the create-renewal
 * flow only ever persists, never reconstitutes. No setters — all access is via
 * getters. The service passes this aggregate directly to the repository; the
 * repository maps the getters to sqlc's generated arg objects.
 *
 * Named for the domain concept (not "MembershipRenewalAggregate") to match the
 * `Member` precedent.
 *
 * ## Why this aggregate exists (and what it does NOT do yet)
 *
 * The members module's domain layer earns its keep on heavy self-invariants
 * (id_card crypto/format, position-active, location swap). The create-renewal
 * flow has only ONE self-invariant today: the submission-kind → status-pair
 * mapping. Centralizing that rule here (rather than a ternary in the service)
 * is this aggregate's current job — modest, but it keeps the rule out of the
 * service layer and gives the future review/approve API a home. The renewal
 * *state machine* (PENDING_REVIEW → APPROVED|REJECTED transitions, supersede-
 * on-renew) is the real domain logic; it lands here when that API ships.
 */
export class MembershipRenewal {
	private constructor(private readonly props: MembershipRenewalProps) {}

	// --- Getters (Read-Only Access) ---

	get memberId() {
		return this.props.memberId
	}
	get paymentSlipFilePath() {
		return this.props.paymentSlipFilePath
	}
	get paymentDateAt() {
		return this.props.paymentDateAt
	}
	get status() {
		return this.props.status
	}
	get memberStatusOnRenewal() {
		return this.props.memberStatusOnRenewal
	}
	/**
	 * The new `members.expires_at` for a Manual Renewal Submission. `undefined`
	 * on an aggregate built by the public {@link create} factory; always set on
	 * one built by {@link createManual}. The repository reads this ONLY on the
	 * manual write path.
	 */
	get expiresAt(): Date | undefined {
		return this.props.expiresAt
	}

	// --- Factory: New Renewal Creation ---

	/**
	 * Resolve a persistence-ready Membership Renewal from a create request.
	 *
	 * Owns the submission-kind → status-pair rule (ADR-0015):
	 *   - admin submission (isAdmin=true)  → status=APPROVED, memberStatus=ACTIVE
	 *   - public submission (isAdmin=false) → status=PENDING_REVIEW, memberStatus=PENDING_RENEWAL
	 *
	 * `paymentDateAt` is stamped here at `now` (server time), not carried on the
	 * request. The boundary validations (member_id positive integer, payment_slip
	 * non-empty) are owned by the Valibot schema at the route; this factory
	 * trusts them. Cross-entity rules (member exists, status eligible) require a
	 * DB read and live in the service, which calls this AFTER that pre-check.
	 *
	 * Returns `ok` unconditionally today — no self-invariant can fail. The
	 * `Result` shape matches {@link Member.create} so the future review API can
	 * add real transition-validation here without changing the call signature.
	 */
	static create(input: { memberId: number; paymentSlipFilePath: string; isAdmin: boolean; now: Date }): Result<MembershipRenewal, never> {
		const status: RenewalStatus = input.isAdmin ? "APPROVED" : "PENDING_REVIEW"
		const memberStatusOnRenewal: MemberStatusOnRenewal = input.isAdmin ? "ACTIVE" : "PENDING_RENEWAL"

		return ok(
			new MembershipRenewal({
				memberId: input.memberId,
				paymentSlipFilePath: input.paymentSlipFilePath,
				paymentDateAt: input.now,
				status,
				memberStatusOnRenewal,
			})
		)
	}

	// --- Factory: Manual Renewal Creation (staff) ---

	/**
	 * Resolve a persistence-ready Membership Renewal for a MANUAL (staff)
	 * submission via `POST /api/v1/membership/renewals/manual` (ADR-0016).
	 *
	 * A Manual Renewal Submission is always an Admin Submission — the route is
	 * wrapped in `withAuth`, so by the time this runs the caller is proven
	 * staff — so the status pair is fixed to APPROVED / ACTIVE. There is no
	 * `isAdmin` input here (unlike {@link create}): the manual route's auth
	 * contract *is* the proof.
	 *
	 * DISTINCT from a plain Admin Submission on the public endpoint: a manual
	 * renewal ALSO advances the membership clock. This factory computes the new
	 * `expires_at` via the shared Membership Expiry rule
	 * (`computeMembershipExpiry` = end of next year), exposed via
	 * {@link expiresAt} so the manual repository write can set it and bump
	 * `renewal_successful_count` in the same transaction. The public path
	 * leaves both untouched (ADR-0015).
	 *
	 * Returns `ok` unconditionally today — the `Result` shape mirrors
	 * {@link create} so a future transition-validation can fail here without a
	 * signature change.
	 */
	static createManual(input: { memberId: number; paymentSlipFilePath: string; now: Date }): Result<MembershipRenewal, never> {
		return ok(
			new MembershipRenewal({
				memberId: input.memberId,
				paymentSlipFilePath: input.paymentSlipFilePath,
				paymentDateAt: input.now,
				status: "APPROVED",
				memberStatusOnRenewal: "ACTIVE",
				expiresAt: computeMembershipExpiry(input.now),
			})
		)
	}
}
