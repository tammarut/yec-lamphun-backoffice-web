import { err, ok, type Result } from "neverthrow"
import type { Sql } from "postgres"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, singleton } from "tsyringe"
import { Member } from "../../domain/member"
import { MemberBusiness } from "../../domain/member-business"
import { shouldPositionConflict } from "../../domain/position-conflict-policy"
import type { IBusinessesRepository } from "../../repository/businesses/interfaces"
import type { IMemberDocumentsRepository } from "../../repository/member-document/interfaces"
import type { IMemberRepository } from "../../interfaces"
import type { CreateMemberError, MemberConflictReason } from "./create-member.errors"
import { MemberConflictError, MemberValidationError } from "./create-member.errors"
import type { CreateMemberRequest } from "./create-member.types"

/**
 * Use case: create a new member.
 *
 * Owns the cross-member rules that need DB queries:
 *   - business intent resolution (#62 D2/D5): link (business_id present) → the
 *     target must be a LIVE business, else 400; create (full field set) → a
 *     live juristic_registration_no collision is a 409 — POST never
 *     silent-auto-links
 *   - duplicate id_card (by blind index) → 409 DUPLICATE_ID_CARD
 *   - occupied SINGLE position (cardinality-aware, ADR-0006) → 409 POSITION_OCCUPIED
 *
 * Delegates the self-invariants (id_card format + expiry, position active,
 * encryption, defaults, documents) to {@link Member.create}, which returns a
 * fully validated Member aggregate; the business VO is built HERE (create
 * branch) and passed in — link branches pass null and the tx links the
 * existing business id instead.
 *
 * Also owns the multi-table CREATE transaction (ADR-0024 — services own every
 * multi-table tx; each repository executes its own table's step):
 *   1. create branch: businesses row first (its generated id feeds the NOT
 *      NULL business_id); link branch: no business write — the target id flows
 *      straight into the member insert
 *   2. member row with that link
 *   3. one document row per provided document
 * Any step throwing DatabaseError auto-rollbacks the whole transaction.
 *
 * Flow:
 *   1. Resolve the business intent (checks above, OUTSIDE tx).
 *   2. Fetch the position + check it's not already held (cardinality-aware, ADR-0006).
 *   3. Member.create() — validate + encrypt + compute defaults.
 *   4. OUTSIDE tx: duplicate id_card check → 409.
 *   5. The create transaction above → ok(memberId).
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<number, CreateMemberError>>`.
 */
@singleton()
export class CreateNewMemberService {
	constructor(
		@inject(DatabaseClient) private readonly dbClient: DatabaseClient,
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.BUSINESSES_REPOSITORY) private readonly businessesRepository: IBusinessesRepository,
		@inject(REGISTER_KEY.MEMBER_DOCUMENTS_REPOSITORY) private readonly documentsRepository: IMemberDocumentsRepository,
		@inject(REGISTER_KEY.ENCRYPTION_SERVICE) private readonly encryption: IEncryptionService,
		@inject(REGISTER_KEY.BLIND_INDEX_SERVICE) private readonly blindIndex: IBlindIndexService
	) {}

	async execute(req: CreateMemberRequest): Promise<Result<number, CreateMemberError>> {
		// 1. Resolve the business intent (#62 D2/D5) — link vs create.
		const resolvedBusiness = await this.resolveBusinessIntent(req)
		if (resolvedBusiness.isErr()) {
			return err(resolvedBusiness.error)
		}

		// 2. Fetch the position + check it's not already held (cardinality-aware,
		//    ADR-0006). These are tightly coupled — both consume the position data
		//    fetched here — so we do them together before the crypto-heavy Member.create.
		const position = await this.repository.getPositionByCode(req.position)
		if (position.isErr()) {
			return err(position.error)
		}
		if (position.value === null) {
			return err(new MemberValidationError(`Unknown position code: ${req.position}`))
		}

		// 3. OUTSIDE tx: position-occupied check (cardinality-aware, ADR-0006).
		const holderCount = await this.repository.countActiveHolderByPosition(req.position)
		if (holderCount.isErr()) {
			return err(holderCount.error)
		}
		if (shouldPositionConflict(position.value.cardinality, holderCount.value > 0)) {
			return err(this.conflict("POSITION_OCCUPIED", `Position ${req.position} is already held`))
		}

		// 4. Validate + encrypt + compute defaults (self-invariants in Member).
		//    Link branch: no business VO — the member carries no business columns.
		const member = Member.create(
			req,
			position.value,
			this.encryption,
			this.blindIndex,
			new Date(),
			resolvedBusiness.value.kind === "create" ? resolvedBusiness.value.business : null
		)
		if (member.isErr()) {
			return err(member.error)
		}

		// 5. OUTSIDE tx: duplicate id_card check (by blind index).
		const dupCount = await this.repository.countMemberByIdCardHash(member.value.idCardNoHash)
		if (dupCount.isErr()) {
			return err(dupCount.error)
		}
		if (dupCount.value > 0) {
			return err(this.conflict("DUPLICATE_ID_CARD", "A member with this ID card already exists"))
		}

		// 5b. OUTSIDE tx: live-contact conflict check — phone/email/line_id are
		//     unique among LIVE members (partial unique indexes uniq_members_*_live).
		//     Pre-checked here for a precise 409 instead of a 23505 → 500.
		const contactConflicts = await this.repository.findLiveContactConflicts(req.phoneNo, req.email, req.lineId, null)
		if (contactConflicts.isErr()) {
			return err(contactConflicts.error)
		}
		if (contactConflicts.value.phoneNo) {
			return err(this.conflict("DUPLICATE_PHONE_NO", "A member with this phone number already exists"))
		}
		if (contactConflicts.value.email) {
			return err(this.conflict("DUPLICATE_EMAIL", "A member with this email already exists"))
		}
		if (contactConflicts.value.lineId) {
			return err(this.conflict("DUPLICATE_LINE_ID", "A member with this Line ID already exists"))
		}

		// 6. Persist — the multi-table CREATE transaction (ADR-0024): create
		//    branch: businesses → member (with the link) → documents; link
		//    branch: re-check + lock the target business, then member (pointing
		//    at the EXISTING id) → documents. Auto-commit on success,
		//    auto-rollback on any throw.
		try {
			const memberId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				let businessId: number
				if (resolvedBusiness.value.kind === "link") {
					// Tx-scoped liveness re-check (LockLiveBusinessIdById): the FOR
					// UPDATE serializes against a concurrent ADR-0023 delete-cascade
					// of the target, so the pre-check race cannot write a live
					// member onto a soft-deleted business. null = target died in the
					// window (or never existed) → abort as a DatabaseError → 500.
					const lockedTarget = await this.businessesRepository.lockLiveBusinessById(sql, resolvedBusiness.value.businessId)
					if (lockedTarget === null) {
						throw new DatabaseError(`business_id ${resolvedBusiness.value.businessId} does not match a live business`)
					}
					businessId = lockedTarget
				} else {
					businessId = await this.businessesRepository.insertBusiness(sql, resolvedBusiness.value.business)
				}
				const memberId = await this.repository.insertMember(sql, member.value, businessId)
				for (const doc of member.value.documents) {
					await this.documentsRepository.insertDocument(sql, memberId, doc)
				}

				return memberId
			})

			return ok(memberId)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Member creation transaction failed", error))
		}
	}

	/**
	 * Resolve the request's business intent against the DB (#62 D2/D5):
	 *   - link: the business_id must match a LIVE business (unknown/soft-deleted
	 *     → 400). No juristic check — the target row is untouched. The tx's
	 *     lockLiveBusinessById re-checks with a lock before the write.
	 *   - create: build the VO (validates + owns the [lat,long]→[long,lat]
	 *     swap), then a live juristic-no collision with a DIFFERENT business →
	 *     409. The DB-side guard is the partial unique index
	 *     idx_businesses_juristic_registration_no; this pre-check converts it
	 *     into a precise 409 instead of a 23505 → 500 (same accepted race
	 *     window as every other pre-check here).
	 */
	private async resolveBusinessIntent(
		req: CreateMemberRequest
	): Promise<Result<{ kind: "link"; businessId: number } | { kind: "create"; business: MemberBusiness }, CreateMemberError>> {
		if (req.business.kind === "link") {
			const live = await this.businessesRepository.existsLiveBusiness(req.business.businessId)
			if (live.isErr()) {
				return err(live.error)
			}
			if (!live.value) {
				return err(new MemberValidationError(`business.business_id ${req.business.businessId} does not match a live business`))
			}
			return ok({ kind: "link", businessId: req.business.businessId })
		}

		const businessVo = MemberBusiness.fromRequest(req.business.business)
		if (businessVo.isErr()) {
			return err(businessVo.error)
		}

		const juristicConflict = await this.businessesRepository.findLiveJuristicConflict(businessVo.value.juristicRegistrationNo, null)
		if (juristicConflict.isErr()) {
			return err(juristicConflict.error)
		}
		if (juristicConflict.value !== null) {
			return err(this.conflict("BUSINESS_JURISTIC_CONFLICT", "A business with this registration number already exists"))
		}

		return ok({ kind: "create", business: businessVo.value })
	}

	/** Construct a MemberConflictError with a stable message. */
	private conflict(reason: MemberConflictReason, message: string): MemberConflictError {
		return new MemberConflictError(reason, message)
	}
}
