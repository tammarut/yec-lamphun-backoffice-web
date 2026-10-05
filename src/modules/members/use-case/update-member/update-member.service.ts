import { err, ok, type Result } from "neverthrow"
import type { Sql } from "postgres"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, singleton } from "tsyringe"
import { Member } from "../../domain/member"
import { MemberBusiness } from "../../domain/member-business"
import { shouldPositionConflict } from "../../domain/position-conflict-policy"
import type { MemberBusinessReadModel, MemberDocumentType } from "../../domain/member-read-models"
import type { IBusinessesRepository } from "../../repository/businesses/interfaces"
import type { IMemberDocumentsRepository } from "../../repository/member-document/interfaces"
import type { IMemberRepository } from "../../interfaces"
import { MemberConflictError, MemberValidationError, type MemberConflictReason } from "../create-new-member/create-member.errors"
import { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"
import type { UpdateMemberError } from "./update-member.errors"
import type { UpdateMemberRequest } from "./update-member.types"

/**
 * Use case: update an existing member by id (PATCH /api/v1/members/:id).
 *
 * Owns the cross-member rules that need DB queries, mirroring
 * {@link CreateNewMemberService} but with PATCH semantics (ADR-0012):
 *   - existence check (member id must resolve) → 404
 *   - business intent resolution (#62 D1/D3): link branch → the target must be
 *     a LIVE business, else 400; re-linking to the member's CURRENT business is
 *     an allowed no-op. Edit branch → a live juristic_registration_no collision
 *     with a DIFFERENT business is a 409, self-excluding (the member's own
 *     linked business is excluded — the edit targets it).
 *   - conditional duplicate id_card: only when the new id_card hash differs
 *     from the stored one (spec pseudocode "opt" block) → 409
 *   - conditional position-occupied: only when the requested position differs
 *     from the stored one, with the member excluded from the holder count
 *     (grilling Q3) → 409
 *
 * Also owns the sticky file-path fields (ADR-0012): when the request sends
 * `null` for any of profile_avatar, id_card_image, company_certificate, the
 * stored value is substituted before building the aggregate, so the UPDATE
 * never nulls them out — these three are member-level and apply in BOTH
 * branches. business.logo/product stickiness only exists in the edit branch
 * (the link branch sends no business fields) and is resolved INTO the business
 * VO. id_card_no follows the same null-sticky rule (README §8 item 9) but is
 * resolved differently — the stored value is ciphertext, not plaintext, so it
 * cannot be substituted into the request; Member.update carries it over via
 * the preserved cipher instead.
 *
 * The re-link runs INSIDE the update transaction with ADR-0023 lifecycle
 * participation: lock the member's current (old) business row first
 * (member→business lock order), re-check + lock the TARGET business, re-point
 * the member, then soft-delete the old business when it held the last live
 * link — the member's logo/product display follows the target business (files
 * live on the business row). The target lock closes the liveness pre-check
 * race; a target that dies in the window aborts the tx as a DatabaseError →
 * 500 (a rare lost race, never a corrupted link).
 *
 * Delegates the self-invariants (id_card expiry + format + encrypt, position
 * active, business VO with location swap, document collection) to
 * {@link Member.update}, which preserves the lifecycle fields (status,
 * member_since, expires_at, renewal_successful_count) from the existing member.
 *
 * Concurrency: no lock — last writer wins, matching the create flow (grilling
 * Q11). The truly unique columns (id_card_no_hash, phone_no, email) are guarded
 * by DB unique indexes.
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<void, UpdateMemberError>>`.
 */
@singleton()
export class UpdateMemberService {
	constructor(
		@inject(DatabaseClient) private readonly dbClient: DatabaseClient,
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.BUSINESSES_REPOSITORY) private readonly businessesRepository: IBusinessesRepository,
		@inject(REGISTER_KEY.MEMBER_DOCUMENTS_REPOSITORY) private readonly documentsRepository: IMemberDocumentsRepository,
		@inject(REGISTER_KEY.ENCRYPTION_SERVICE) private readonly encryption: IEncryptionService,
		@inject(REGISTER_KEY.BLIND_INDEX_SERVICE) private readonly blindIndex: IBlindIndexService
	) {}

	async execute(id: number, req: UpdateMemberRequest): Promise<Result<void, UpdateMemberError>> {
		// 1. Existence check + fetch stored values needed for the conditional
		//    checks and sticky-file resolution. getMemberDetailById returns
		//    null for not-found / soft-deleted → 404 (the two are deliberately
		//    indistinguishable, matching GET /:id).
		const existingResult = await this.repository.getMemberDetailById(id)
		if (existingResult.isErr()) {
			return err(existingResult.error)
		}
		const existing = existingResult.value
		if (existing === null) {
			return err(new MemberNotFoundError())
		}
		if (existing.business === null) {
			// Unreachable in practice — the repository's read already maps a live
			// member with no live business to DatabaseError (corruption → 500).
			// Kept as the type-honest mirror of that guard: this use case needs
			// the shared business id to target the wholesale overwrite / re-link.
			return err(new DatabaseError(`Member ${id} has no live business row (violates the live-member⇒live-business invariant)`))
		}
		// Hoisted out of the transaction closure — TS property narrowing on
		// `existing.business` does not survive into the callback below.
		const businessId = existing.business.id

		// 2. Resolve the business intent (#62 D1/D3) — edit / re-link / no-op.
		//     The non-null guard above narrowed existing.business; passing it
		//     here keeps resolveBusinessWrite's parameter honestly non-nullable.
		const businessWrite = await this.resolveBusinessWrite(req, businessId, existing.business)
		if (businessWrite.isErr()) {
			return err(businessWrite.error)
		}

		// 3. Resolve the member-level sticky file-path fields (ADR-0012): null in
		//    the request → keep the stored value. Scalars write through unchanged.
		//    (business.logo/product stickiness lives inside the edit branch's VO.)
		const resolvedReq = resolveStickyFilePath(req, existing)

		// 4. Fetch the requested position ONCE. It's needed both for the
		//    conflict check (step 4a) and for Member.update's active-position
		//    self-invariant (step 5). Unknown/inactive → 400.
		const positionResult = await this.repository.getPositionByCode(resolvedReq.position)
		if (positionResult.isErr()) {
			return err(positionResult.error)
		}
		const position = positionResult.value
		if (position === null) {
			return err(new MemberValidationError(`Unknown position code: ${resolvedReq.position}`))
		}

		// 4a. Position-cardinality conflict check — ONLY when the requested
		//     position differs from the stored one. When the position is
		//     unchanged the check is skipped entirely, which is how the member
		//     is excluded from conflicting with themselves (grilling Q3): they
		//     hold their own position, and re-saving it is not a conflict.
		//     Within this block the position IS changing, so the member is not
		//     among the target position's current holders — no subtraction.
		if (resolvedReq.position !== existing.positionCode) {
			const holderCount = await this.repository.countActiveHolderByPosition(resolvedReq.position)
			if (holderCount.isErr()) {
				return err(holderCount.error)
			}
			if (shouldPositionConflict(position.cardinality, holderCount.value > 0)) {
				return err(this.conflict("POSITION_OCCUPIED", `Position ${resolvedReq.position} is already held`))
			}
		}

		// 5. Validate + encrypt + build the updated aggregate, preserving the
		//    existing member's lifecycle fields (grilling Q4) and — when the
		//    request sends null — the stored id-card cipher (null-sticky
		//    id_card_no, README §8 item 9). Self-invariants live in
		//    Member.update, same as Member.create. Link/no-op branches pass a
		//    null business VO — no business columns are written.
		const updatedMember = Member.update(
			resolvedReq,
			position,
			this.encryption,
			this.blindIndex,
			new Date(),
			{
				memberSince: existing.memberSince,
				expiresAt: existing.expiresAt,
				status: existing.status,
				renewalSuccessfulCount: existing.renewalSuccessfulCount,
				idCardCipher: { idCardNo: existing.idCardNo, idCardNoHash: existing.idCardNoHash },
			},
			businessWrite.value.kind === "edit" ? businessWrite.value.business : null
		)
		if (updatedMember.isErr()) {
			return err(updatedMember.error)
		}

		// 6. Conditional duplicate-id_card check — ONLY when the new id_card
		//    hash differs from the stored one (spec pseudocode "opt" block).
		//    Re-running the check when the id_card is unchanged would count the
		//    member themselves as a duplicate.
		if (updatedMember.value.idCardNoHash !== existing.idCardNoHash) {
			const dupCount = await this.repository.countMemberByIdCardHash(updatedMember.value.idCardNoHash)
			if (dupCount.isErr()) {
				return err(dupCount.error)
			}
			if (dupCount.value > 0) {
				return err(this.conflict("DUPLICATE_ID_CARD", "A member with this ID card already exists"))
			}
		}

		// 6b. Live-contact conflict check — phone/email/line_id unique among LIVE
		//     members (partial unique indexes uniq_members_*_live). Excluding $id
		//     keeps a member's own unchanged contacts from conflicting with
		//     themselves (unlike id_card, no changed-detection needed).
		const contactConflicts = await this.repository.findLiveContactConflicts(resolvedReq.phoneNo, resolvedReq.email, resolvedReq.lineId, id)
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

		// 7. Compute which document types are being replaced, for the
		//    repository's soft-delete+insert step. A type is "replaced" only
		//    when the resolved path DIFFERS from the stored path — re-writing
		//    identical rows would needlessly churn the soft-delete history.
		//    Sticky null → unchanged → not replaced. Same path → not replaced.
		const documentTypesToReplace = computeDocumentTypesToReplace(resolvedReq, {
			idCardImagePath: existing.idCardImagePath,
			companyCertificatePath: existing.companyCertificatePath,
		})

		// 8. Persist — the multi-table UPDATE transaction (ADR-0024): member row →
		//    business write (edit: wholesale overwrite of the shared row;
		//    re-link: lock old business → re-point → release when last live link,
		//    ADR-0023 lifecycle participation; no-op: nothing) → per replaced
		//    type, soft-delete old docs + insert new. Auto-commit on success,
		//    auto-rollback on any throw.
		try {
			await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql

				await this.repository.updateMember(sql, id, updatedMember.value)
				// NOTE: on the re-link path the member's scalar columns are written
				// BEFORE the old/target business locks below (UpdateMemberById never
				// touches business_id, so the link itself is not yet changed). This is
				// a rollback-saves-us design, not lock-prevents-it: if the target
				// business died between the pre-check and the lock, the throw below
				// rolls back these scalar writes too — the client gets a retriable
				// 500 on an otherwise valid request (rare lost race), never a
				// half-applied edit. Reordering locks first would not remove the
				// race, only move it; the tx boundary is the mitigation.

				if (businessWrite.value.kind === "edit") {
					await this.businessesRepository.updateBusinessById(sql, businessId, businessWrite.value.business)
				} else if (businessWrite.value.kind === "relink") {
					// Lock the member's CURRENT (old) business row first — the
					// fixed member→business lock order shared with the
					// delete-cascade gate, so a concurrent re-link/delete of the
					// same member or old business serializes instead of deadlocking.
					const oldBusinessId = await this.businessesRepository.lockLiveBusinessIdByMemberId(sql, id)
					if (oldBusinessId === null) {
						throw new DatabaseError(`Member ${id} has no live business row (violates the live-member⇒live-business invariant)`)
					}
					// Tx-scoped liveness re-check of the TARGET (LockLiveBusinessIdById):
					// closes the pre-check race — a concurrent ADR-0023 delete-cascade
					// of the target takes the same row lock, so it cannot soft-delete
					// the target between our check and our commit. null = the target
					// died in the window → abort (DatabaseError → 500) instead of
					// writing a live member onto a dead business. Opposite re-links
					// can still deadlock on the two row locks; Postgres aborts one
					// victim → a retriable 500, never a corrupted state.
					const lockedTarget = await this.businessesRepository.lockLiveBusinessById(sql, businessWrite.value.targetId)
					if (lockedTarget === null) {
						throw new DatabaseError(`business_id ${businessWrite.value.targetId} does not match a live business`)
					}
					await this.repository.updateMemberBusinessLink(sql, id, businessWrite.value.targetId)
					// ADR-0023: the old business does not survive its last live
					// link. The member was re-pointed above, so the business_id
					// filter already excludes them; the id exclusion is
					// belt-and-braces, same as the delete cascade.
					const remainingLiveMembers = await this.businessesRepository.countLiveMembersByBusinessId(sql, oldBusinessId, id)
					if (remainingLiveMembers === 0) {
						await this.businessesRepository.softDeleteBusinessById(sql, oldBusinessId)
					}
				}

				if (documentTypesToReplace.length > 0) {
					// Soft-delete the live rows of the replaced type(s) first.
					await this.documentsRepository.softDeleteByTypes(sql, id, documentTypesToReplace)
					// Then insert the new rows from the updated member's documents,
					// filtered to just the replaced types.
					const newDocsToInsert = updatedMember.value.documents.filter((doc) => documentTypesToReplace.includes(doc.type))
					for (const doc of newDocsToInsert) {
						await this.documentsRepository.insertDocument(sql, id, doc)
					}
				}
			})

			return ok(undefined)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Member update transaction failed", error))
		}
	}

	/**
	 * Resolve the request's business intent against the DB into the tx's business
	 * write (#62 D1/D3):
	 *   - link branch: the target must be a LIVE business (unknown/soft-deleted
	 *     → 400). Re-linking to the member's CURRENT business is an allowed
	 *     no-op; anything else is a re-link (field edits are never mixed with a
	 *     re-link — re-link first, then PATCH fields if needed).
	 *   - edit branch: build the VO with logo/product null-sticky resolution
	 *     (ADR-0012, resolved against the SHARED row), then a live juristic-no
	 *     collision with a DIFFERENT business → 409, self-excluding
	 *     (excludes this member's own linked business — the edit's target).
	 *
	 * `currentBusiness` is the member's linked business read model — the caller
	 * passes it only after the non-null guard, so it is non-nullable here.
	 */
	private async resolveBusinessWrite(
		req: UpdateMemberRequest,
		currentBusinessId: number,
		currentBusiness: MemberBusinessReadModel
	): Promise<Result<{ kind: "edit"; business: MemberBusiness } | { kind: "relink"; targetId: number } | { kind: "none" }, UpdateMemberError>> {
		if (req.business.kind === "link") {
			const live = await this.businessesRepository.existsLiveBusiness(req.business.businessId)
			if (live.isErr()) {
				return err(live.error)
			}
			if (!live.value) {
				return err(new MemberValidationError(`business.business_id ${req.business.businessId} does not match a live business`))
			}
			return ok(req.business.businessId === currentBusinessId ? { kind: "none" } : { kind: "relink", targetId: req.business.businessId })
		}

		// Edit branch — business.logo/product null-sticky (ADR-0012): null in the
		// request → keep the stored value on the shared row.
		const businessVo = MemberBusiness.fromRequest({
			...req.business.business,
			logo: req.business.business.logo ?? currentBusiness.logoFilePath,
			product: req.business.business.product ?? currentBusiness.productFilePath,
		})
		if (businessVo.isErr()) {
			return err(businessVo.error)
		}

		// Self-excluding juristic collision (#62 D3): a DIFFERENT live business
		// already holds this number. The member's own linked business is excluded
		// — the edit targets it. Mirrors FindLiveContactConflicts; the partial
		// unique index idx_businesses_juristic_registration_no is the DB-side guard.
		const juristicConflict = await this.businessesRepository.findLiveJuristicConflict(businessVo.value.juristicRegistrationNo, currentBusinessId)
		if (juristicConflict.isErr()) {
			return err(juristicConflict.error)
		}
		if (juristicConflict.value !== null) {
			return err(this.conflict("BUSINESS_JURISTIC_CONFLICT", "A business with this registration number already exists"))
		}

		return ok({ kind: "edit", business: businessVo.value })
	}

	/** Construct a MemberConflictError with a stable message. */
	private conflict(reason: MemberConflictReason, message: string): MemberConflictError {
		return new MemberConflictError(reason, message)
	}
}

/**
 * Resolve the three member-level sticky file-path fields (ADR-0012): when the
 * request sends `null` for any of them, substitute the existing stored value so
 * the aggregate and UPDATE see a concrete path and never null it out. All other
 * fields pass through verbatim (scalars write through, including nulls that
 * clear columns; a null idCardNo passes through unresolved — Member.update
 * handles it via the preserved cipher).
 *
 * business.logo/product are NOT resolved here — they only exist in the edit
 * branch and are resolved into the business VO by {@link resolveBusinessWrite}.
 */
function resolveStickyFilePath(
	req: UpdateMemberRequest,
	existing: {
		profileAvatar: string | null
		idCardImagePath: string | null
		companyCertificatePath: string | null
	}
): UpdateMemberRequest {
	return {
		...req,
		profileAvatar: req.profileAvatar ?? existing.profileAvatar,
		idCardImage: req.idCardImage ?? existing.idCardImagePath,
		companyCertificate: req.companyCertificate ?? existing.companyCertificatePath,
	}
}

/**
 * Compute the set of document types being replaced by this PATCH. A type is
 * replaced only when its resolved path is non-null AND differs from the stored
 * path. Sticky null (unchanged) and same-path (no-op) both exclude the type, so
 * an edit that doesn't touch documents causes no soft-delete churn.
 */
function computeDocumentTypesToReplace(
	resolvedReq: UpdateMemberRequest,
	existing: { idCardImagePath: string | null; companyCertificatePath: string | null }
): readonly MemberDocumentType[] {
	const types: MemberDocumentType[] = []
	if (resolvedReq.idCardImage !== null && resolvedReq.idCardImage !== existing.idCardImagePath) {
		types.push("ID_CARD")
	}
	if (resolvedReq.companyCertificate !== null && resolvedReq.companyCertificate !== existing.companyCertificatePath) {
		types.push("COMPANY_CERTIFICATE")
	}
	return types
}
