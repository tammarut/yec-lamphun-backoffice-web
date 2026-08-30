import { err, ok, type Result } from "neverthrow"
import { RenewalAlreadyReviewedError } from "../use-case/review-renewal/review-renewal.errors"
import { computeMembershipExpiry } from "src/modules/shared/membership/membership-expiry"

/**
 * The Renewal Status of a single Membership Renewal.
 *
 * `PENDING_REVIEW` is the entry point for a Public Submission; `APPROVED` is the
 * entry point for an Admin Submission (instant approval, ADR-0015). Both
 * `APPROVED` and `REJECTED` are terminal — they are set at submission (Admin
 * Submission) or by the Renewal Review flow (ADR-0018), and a decided renewal
 * never transitions again. Mirrors the `chk_membership_renewals_status` CHECK
 * constraint verbatim.
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
 * The review outcome ({@link ReviewedRenewal}) is the review flow's counterpart
 * to this create-flow bag.
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
 * The reconstituted state a Renewal Review acts on (ADR-0018): exactly the
 * columns `GetRenewalForReview` selects. Deliberately NOT the full row — the
 * review decision needs identity and current status only; the payment slip and
 * dates are irrelevant to the transition. Instances built from this shape are
 * the only ones on which {@link MembershipRenewal.review} is defined.
 */
export type MembershipRenewalDbProps = {
	readonly id: number
	readonly memberId: number
	readonly status: RenewalStatus
}

/**
 * The staff review decision applied to a live `PENDING_REVIEW` Membership
 * Renewal (ADR-0018). Both values are terminal; the boundary schema restricts
 * the request to exactly this pair.
 */
export type ReviewDecision = "APPROVED" | "REJECTED"

/**
 * The Member Status the review flow writes back to `members.status`: `ACTIVE`
 * on approve, `EXPIRED` on reject. The write-only subset for this flow —
 * matches how {@link MemberStatusOnRenewal} narrows the create flow.
 */
export type MemberStatusOnReview = "ACTIVE" | "EXPIRED"

/**
 * The persistence-ready outcome of a Renewal Review (ADR-0018) — what
 * {@link MembershipRenewal.review} hands the repository's `applyReview`.
 *
 * `rejectionReason` is the decision's reason on reject and `null` on approve
 * (the boundary schema enforces the pairing before this exists). `expiresAt`
 * is present ONLY on approve — the shared Membership Expiry rule
 * (`computeMembershipExpiry`, end of next year) — so the repo's approve branch
 * can bind it exactly like the manual flow does. `renewal_successful_count` is
 * NOT carried here: it is incremented in SQL (`count + 1`), never
 * read-then-written in TS.
 */
export type ReviewedRenewal = {
	readonly renewalId: number
	readonly memberId: number
	readonly status: ReviewDecision
	readonly rejectionReason: string | null
	readonly reviewedAt: Date
	readonly memberStatus: MemberStatusOnReview
	readonly expiresAt?: Date
}

/**
 * A Membership Renewal in one of its two instanciations: persistence-ready
 * after a create request (create-shaped props), or reconstituted from the DB
 * for a Renewal Review (db-shaped props carrying the row's id).
 *
 * Constructed exclusively through the static factories ({@link create},
 * {@link createManual}, {@link fromDb}) — no other rehydration exists beyond
 * the review's three columns. No setters — all access is via getters. The
 * service passes the create aggregate directly to the repository; the
 * repository maps the getters to sqlc's generated arg objects.
 *
 * Named for the domain concept (not "MembershipRenewalAggregate") to match the
 * `Member` precedent.
 *
 * ## The aggregate's two jobs
 *
 * 1. The submission-kind → status-pair rule (ADR-0015), centralized in
 *    {@link create}/{@link createManual} rather than a ternary in the service.
 * 2. The renewal state machine (ADR-0018): {@link fromDb} + {@link review} own
 *    the `PENDING_REVIEW`-only transition and compute the review outcome,
 *    keeping the rule out of the service layer.
 */
export class MembershipRenewal {
	private constructor(private readonly props: MembershipRenewalProps | MembershipRenewalDbProps) {}

	/**
	 * Narrow the props union to the create shape. The create-only getters below
	 * are reached only on create-built instances (the repo's create paths); the
	 * review path ({@link review}) reads the db shape instead. Mirrors the
	 * `toPgDate` stance: throw on impossible state rather than fabricate data.
	 */
	private createProps(): MembershipRenewalProps {
		if (!("paymentSlipFilePath" in this.props)) {
			throw new Error("This getter is only defined on a create-built MembershipRenewal")
		}
		return this.props
	}

	// --- Getters (Read-Only Access) ---

	get memberId() {
		return this.props.memberId
	}
	get paymentSlipFilePath() {
		return this.createProps().paymentSlipFilePath
	}
	get paymentDateAt() {
		return this.createProps().paymentDateAt
	}
	get status() {
		return this.props.status
	}
	get memberStatusOnRenewal() {
		return this.createProps().memberStatusOnRenewal
	}
	/**
	 * The new `members.expires_at` for a Manual Renewal Submission. `undefined`
	 * on an aggregate built by the public {@link create} factory; always set on
	 * one built by {@link createManual}. The repository reads this ONLY on the
	 * manual write path.
	 */
	get expiresAt(): Date | undefined {
		return this.createProps().expiresAt
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

	// --- Factory: From Database (for Renewal Review) ---

	/**
	 * Reconstitute a Membership Renewal for a Renewal Review (ADR-0018) — the
	 * review API the domain reserved since ADR-0015/0016. Trusts persisted data
	 * (skips validation), exactly like `Member.fromDb`; the row is the three
	 * columns `GetRenewalForReview` selects, which is all the transition needs.
	 * The service calls this AFTER the repository read and BEFORE
	 * {@link review}.
	 */
	static fromDb(row: MembershipRenewalDbProps): MembershipRenewal {
		return new MembershipRenewal(row)
	}

	// --- State Machine: Renewal Review (ADR-0018) ---

	/**
	 * Decide this renewal — the `PENDING_REVIEW` → terminal transition the
	 * aggregate owns (ADR-0018). Only a live `PENDING_REVIEW` renewal may be
	 * decided; anything else (APPROVED / REJECTED, whether at submission or by
	 * an earlier review) is `err(RenewalAlreadyReviewedError)` → 409 at the
	 * route. This is the domain-level twin of the SQL guard on
	 * `UpdateRenewalOnReview`: the service's pre-check catches the clean case,
	 * the SQL guard catches the race, and this rule is what both enforce.
	 *
	 * The status/reason pairing (REJECTED requires a non-empty reason, APPROVED
	 * forbids one) is NOT re-checked here — it is a pure function of the request
	 * body, owned by the route's Valibot schema, which runs before any of this.
	 *
	 * Approve computes `expiresAt` via the shared Membership Expiry rule — the
	 * same `computeMembershipExpiry` the manual factory uses — and yields
	 * memberStatus ACTIVE; reject carries the reason and yields EXPIRED. The
	 * `renewal_successful_count` bump is deliberately absent: the repository
	 * increments it in SQL inside the same transaction.
	 */
	review(input: { decision: ReviewDecision; reason: string | null; now: Date }): Result<ReviewedRenewal, RenewalAlreadyReviewedError> {
		const row = this.props
		if (!("id" in row)) {
			// review() is only defined on a fromDb-reconstituted renewal; the
			// service never calls it on a create-built instance. Programmer
			// error — throw rather than fabricate a renewalId.
			throw new Error("review() requires a fromDb-reconstituted MembershipRenewal")
		}
		if (row.status !== "PENDING_REVIEW") {
			return err(new RenewalAlreadyReviewedError())
		}

		if (input.decision === "APPROVED") {
			return ok({
				renewalId: row.id,
				memberId: row.memberId,
				status: "APPROVED",
				rejectionReason: null,
				reviewedAt: input.now,
				memberStatus: "ACTIVE",
				expiresAt: computeMembershipExpiry(input.now),
			})
		}
		return ok({
			renewalId: row.id,
			memberId: row.memberId,
			status: "REJECTED",
			rejectionReason: input.reason,
			reviewedAt: input.now,
			memberStatus: "EXPIRED",
		})
	}
}
