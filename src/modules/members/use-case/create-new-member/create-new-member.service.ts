import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { inject, singleton } from "tsyringe"
import { Member } from "../../domain/member"
import { shouldPositionConflict } from "../../domain/position-conflict-policy"
import type { IMemberRepository } from "../../interfaces"
import type { CreateMemberError, MemberConflictReason } from "./create-member.errors"
import { MemberConflictError, MemberValidationError } from "./create-member.errors"
import type { CreateMemberRequest } from "./create-member.types"

/**
 * Use case: create a new member.
 *
 * Owns the cross-member rules that need DB queries:
 *   - duplicate id_card (by blind index) → 409 DUPLICATE_ID_CARD
 *   - occupied SINGLE position (cardinality-aware, ADR-0006) → 409 POSITION_OCCUPIED
 *
 * Delegates the self-invariants (id_card format + expiry, position active,
 * encryption, defaults, business VO, documents) to {@link Member.create}, which
 * returns a fully validated Member aggregate. The aggregate is passed directly
 * to {@link IMemberRepository.create} — the transaction and multi-table insert
 * are invisible implementation details of the repository.
 *
 * Flow:
 *   1. Fetch the position + check it's not already held (cardinality-aware, ADR-0006).
 *   2. Member.create() — validate + encrypt + compute defaults + build VOs.
 *   3. OUTSIDE tx: duplicate id_card check → 409.
 *   4. repository.create(member) — atomically inserts member + documents + business.
 *
 * Returns AGENTS.md §2B single-wrapped `Promise<Result<number, CreateMemberError>>`.
 * The repository converts all DB errors to DatabaseError internally; the service
 * never needs try/catch.
 */
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

		// 5. Persist — the transaction + multi-table insert is an internal detail
		//    of the repository. One call, returns ok(id) or err(DatabaseError).
		const createResult = await this.repository.create(member.value)
		if (createResult.isErr()) {
			return err(createResult.error)
		}

		return ok(createResult.value)
	}

	/** Construct a MemberConflictError with a stable message. */
	private conflict(reason: MemberConflictReason, message: string): MemberConflictError {
		return new MemberConflictError(reason, message)
	}
}
