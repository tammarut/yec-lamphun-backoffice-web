import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import { Member } from "../../domain/member"
import { shouldPositionConflict } from "../../domain/position-conflict-policy"
import type { IMemberRepository } from "../../interfaces"
import type { CreateMemberError, MemberConflictReason } from "./create-member.errors"
import { MemberConflictError, MemberValidationError } from "./create-member.errors"
import type { CreateMemberRequest } from "./create-member.types"

@singleton()
export class CreateNewMemberService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.ENCRYPTION_SERVICE) private readonly encryption: IEncryptionService,
		@inject(REGISTER_KEY.BLIND_INDEX_SERVICE) private readonly blindIndex: IBlindIndexService
	) {}

	async execute(req: CreateMemberRequest): Promise<Result<number, CreateMemberError>> {
		// 1. Fetch the position + check it's not already held (cardinality-aware,
		//    ADR-0006). These are tightly coupled — both consume the position data
		//    fetched here — so we do them together before the crypto-heavy Member.create.
		const position = await this.repository.getPositionByCode(req.position)
		if (position.isErr()) {
			return err(position.error)
		}
		if (position.value === null) {
			return err(new MemberValidationError(`Unknown position code: ${req.position}`))
		}

		// 2. OUTSIDE tx: position-occupied check (cardinality-aware, ADR-0006).
		const holderCount = await this.repository.countActiveHolderByPosition(req.position)
		if (holderCount.isErr()) {
			return err(holderCount.error)
		}
		if (shouldPositionConflict(position.value.cardinality, holderCount.value > 0)) {
			return err(this.conflict("POSITION_OCCUPIED", `Position ${req.position} is already held`))
		}

		// 3. Validate + encrypt + compute defaults + build VOs (self-invariants in Member).
		const member = Member.create(req, position.value, this.encryption, this.blindIndex, new Date())
		if (member.isErr()) {
			return err(member.error)
		}

		// 4. OUTSIDE tx: duplicate id_card check (by blind index).
		const dupCount = await this.repository.countMemberByIdCardHash(member.value.idCardNoHash)
		if (dupCount.isErr()) {
			return err(dupCount.error)
		}
		if (dupCount.value > 0) {
			return err(this.conflict("DUPLICATE_ID_CARD", "A member with this ID card already exists"))
		}

		// 5. INSIDE tx: insert member, then documents, then business.
		// The transaction callback throws on any inner insert failure (rolling
		// back the tx); we catch here and convert to err() so the service never
		// throws — per AGENTS.md §2B "no unhandled exceptions in business flows".
		const newMember = member.value
		let newMemberId: number
		try {
			newMemberId = await this.repository.transaction(async (tx) => {
				// 5a. Insert the member row, returning the generated id.
				const insertMemberResult = await this.repository.insertMember(tx, newMember)
				if (insertMemberResult.isErr()) {
					throw insertMemberResult.error
				}
				const memberId = insertMemberResult.value

				// 5b. Insert documents (if any).
				if (newMember.documents.length > 0) {
					const docsResult = await this.repository.insertMemberDocuments(tx, memberId, newMember.documents)
					if (docsResult.isErr()) {
						throw docsResult.error
					}
				}

				// 5c. Insert business.
				const bizResult = await this.repository.insertMemberBusiness(tx, memberId, newMember.business)
				if (bizResult.isErr()) {
					throw bizResult.error
				}

				return memberId
			})
		} catch (error) {
			// Re-thrown from the tx callback. If it's already a known error type,
			// surface it directly; otherwise wrap it so the caller gets a Result.
			if (error instanceof DatabaseError) {
				return err(error)
			}
			if (error instanceof CryptoError) {
				return err(error)
			}
			return err(new DatabaseError("Member creation transaction failed", error))
		}

		return ok(newMemberId)
	}

	/** Construct a MemberConflictError with a stable message. */
	private conflict(reason: MemberConflictReason, message: string): MemberConflictError {
		return new MemberConflictError(reason, message)
	}
}
