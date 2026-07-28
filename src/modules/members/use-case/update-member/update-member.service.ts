import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { inject, singleton } from "tsyringe"
import { Member } from "../../domain/member"
import { shouldPositionConflict } from "../../domain/position-conflict-policy"
import type { MemberDocumentType } from "../../domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import { MemberConflictError, MemberValidationError, type MemberConflictReason } from "../create-new-member/create-member.errors"
import type { CreateMemberRequest } from "../create-new-member/create-member.types"
import { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"
import type { UpdateMemberError } from "./update-member.errors"

/**
 * Use case: update an existing member by id (PATCH /api/v1/members/:id).
 *
 * Owns the cross-member rules that need DB queries, mirroring
 * {@link CreateNewMemberService} but with PATCH semantics (ADR-0012):
 *   - existence check (member id must resolve) → 404
 *   - conditional duplicate id_card: only when the new id_card hash differs
 *     from the stored one (spec pseudocode "opt" block) → 409
 *   - conditional position-occupied: only when the requested position differs
 *     from the stored one, with the member excluded from the holder count
 *     (grilling Q3) → 409
 *
 * Also owns the five sticky file-path fields (ADR-0012): when the request sends
 * `null` for any of profile_avatar, id_card_image, company_certificate,
 * business.logo, business.product, the stored value is substituted before
 * building the aggregate, so the UPDATE never nulls them out. From the
 * aggregate's perspective the request always carries concrete file paths.
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
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.ENCRYPTION_SERVICE) private readonly encryption: IEncryptionService,
		@inject(REGISTER_KEY.BLIND_INDEX_SERVICE) private readonly blindIndex: IBlindIndexService
	) {}

	async execute(id: number, req: CreateMemberRequest): Promise<Result<void, UpdateMemberError>> {
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

		// 2. Resolve the five sticky file-path fields (ADR-0012): null in the
		//    request → keep the stored value. Scalars write through unchanged.
		const resolvedReq = resolveStickyFilePath(req, existing)

		// 3. Fetch the requested position ONCE. It's needed both for the
		//    conflict check (step 3a) and for Member.update's active-position
		//    self-invariant (step 4). Unknown/inactive → 400.
		const positionResult = await this.repository.getPositionByCode(resolvedReq.position)
		if (positionResult.isErr()) {
			return err(positionResult.error)
		}
		const position = positionResult.value
		if (position === null) {
			return err(new MemberValidationError(`Unknown position code: ${resolvedReq.position}`))
		}

		// 3a. Position-cardinality conflict check — ONLY when the requested
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

		// 4. Validate + encrypt + build the updated aggregate, preserving the
		//    existing member's lifecycle fields (grilling Q4). Self-invariants
		//    live in Member.update, same as Member.create.
		const updatedMember = Member.update(resolvedReq, position, this.encryption, this.blindIndex, new Date(), {
			memberSince: existing.memberSince,
			expiresAt: existing.expiresAt,
			status: existing.status,
			renewalSuccessfulCount: existing.renewalSuccessfulCount,
		})
		if (updatedMember.isErr()) {
			return err(updatedMember.error)
		}

		// 5. Conditional duplicate-id_card check — ONLY when the new id_card
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

		// 6. Compute which document types are being replaced, for the
		//    repository's soft-delete+insert step. A type is "replaced" only
		//    when the resolved path DIFFERS from the stored path — re-writing
		//    identical rows would needlessly churn the soft-delete history.
		//    Sticky null → unchanged → not replaced. Same path → not replaced.
		const documentTypesToReplace = computeDocumentTypesToReplace(resolvedReq, {
			idCardImagePath: existing.idCardImagePath,
			companyCertificatePath: existing.companyCertificatePath,
		})

		// 7. Persist — the transaction + multi-table update is an internal
		//    detail of the repository. One call, returns ok or err.
		const updateResult = await this.repository.update(id, updatedMember.value, documentTypesToReplace)
		if (updateResult.isErr()) {
			return err(updateResult.error)
		}

		return ok(undefined)
	}

	/** Construct a MemberConflictError with a stable message. */
	private conflict(reason: MemberConflictReason, message: string): MemberConflictError {
		return new MemberConflictError(reason, message)
	}
}

/**
 * Resolve the five sticky file-path fields (ADR-0012): when the request sends
 * `null` for any of them, substitute the existing stored value so the aggregate
 * and UPDATE see a concrete path and never null it out. All other fields pass
 * through verbatim (scalars write through, including nulls that clear columns).
 *
 * The five sticky fields: profile_avatar, id_card_image, company_certificate,
 * business.logo, business.product.
 */
function resolveStickyFilePath(
	req: CreateMemberRequest,
	existing: {
		profileAvatar: string | null
		idCardImagePath: string | null
		companyCertificatePath: string | null
		business: { logoFilePath: string | null; productFilePath: string | null } | null
	}
): CreateMemberRequest {
	return {
		...req,
		profileAvatar: req.profileAvatar ?? existing.profileAvatar,
		idCardImage: req.idCardImage ?? existing.idCardImagePath,
		companyCertificate: req.companyCertificate ?? existing.companyCertificatePath,
		business: {
			...req.business,
			logo: req.business.logo ?? existing.business?.logoFilePath ?? null,
			product: req.business.product ?? existing.business?.productFilePath ?? null,
		},
	}
}

/**
 * Compute the set of document types being replaced by this PATCH. A type is
 * replaced only when its resolved path is non-null AND differs from the stored
 * path. Sticky null (unchanged) and same-path (no-op) both exclude the type, so
 * an edit that doesn't touch documents causes no soft-delete churn.
 */
function computeDocumentTypesToReplace(
	resolvedReq: CreateMemberRequest,
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
