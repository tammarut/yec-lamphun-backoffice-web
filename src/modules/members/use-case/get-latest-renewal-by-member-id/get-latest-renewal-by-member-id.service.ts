import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { inject, singleton } from "tsyringe"
import type { MemberLatestRenewalReadModel } from "../../domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import { MemberOrRenewalNotFoundError, RenewalNotFoundError, type GetLatestRenewalByMemberIdError } from "./get-latest-renewal-by-member-id.errors"
import type { LatestRenewalResponse } from "./get-latest-renewal-by-member-id.types"

/**
 * Use case (query): get a member's latest membership renewal for the backoffice
 * single-view (GET /api/v1/membership/renewals/:member_id).
 *
 * A read-only orchestrator over two collaborators:
 *   1. {@link IMemberRepository.getLatestRenewalByMemberId} — one composite row
 *      (member identity + business name + newest renewal via LEFT JOIN LATERAL).
 *   2. {@link MemberFileUrlService} — resolves the two stored object keys to
 *      URLs: `profile_avatar` (public concat, sync/infallible) and `payment_slip`
 *      (private presign, async/`Result`).
 *
 * Two distinct not-found cases (per spec): the member/business missing (repo
 * returns `null`) → {@link MemberOrRenewalNotFoundError}; the member present but
 * with no renewal (`renewalId === null`) → {@link RenewalNotFoundError}. A
 * presign failure is infra-level and propagates as `err(StorageError)` (→ 500),
 * NOT degraded to null — same policy as get-member-by-id (ADR-0007).
 *
 * Returns AGENTS.md §2B `Promise<Result<LatestRenewalResponse, GetLatestRenewalByMemberIdError>>`.
 */
@singleton()
export class GetLatestRenewalByMemberIdService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.MEMBER_FILE_URL_SERVICE) private readonly urlService: MemberFileUrlService
	) {}

	async execute(id: number): Promise<Result<LatestRenewalResponse, GetLatestRenewalByMemberIdError>> {
		const result = await this.repository.getLatestRenewalByMemberId(id)
		if (result.isErr()) {
			// DatabaseError → propagate → 500.
			return err(result.error)
		}
		if (result.value === null) {
			// 0 rows: member (or its 1:1 business) not found / soft-deleted.
			return err(new MemberOrRenewalNotFoundError())
		}
		const row = result.value
		if (row.renewalId === null) {
			// Member exists but has no live renewal (LEFT LATERAL yielded NULLs).
			return err(new RenewalNotFoundError())
		}

		// profile_avatar: public-bucket concat — sync, infallible (bare string|null).
		const profileAvatar = this.urlService.resolveProfileAvatarUrl(row.profileAvatar)
		// payment_slip: private-bucket presign — async; StorageError propagates → 500.
		const slipResult = await this.urlService.resolvePaymentSlipUrl(row.renewalPaymentSlipFilePath)
		if (slipResult.isErr()) {
			return err(slipResult.error)
		}

		return ok(this.toResponse(row, profileAvatar, slipResult.value))
	}

	/**
	 * Map the read model + resolved URLs to the snake_case API DTO. All three
	 * renewal fields are non-null here: the caller guarded `renewalId === null`
	 * (the LEFT LATERAL yields the renewal_* columns NULL together), and
	 * `payment_slip_file_path` / `payment_date_at` are NOT NULL on
	 * membership_renewals, so a present renewal always carries both. The `!`
	 * assertions mirror the boundary-narrowing in MembersRepository.
	 */
	private toResponse(m: MemberLatestRenewalReadModel, profileAvatar: string | null, paymentSlip: string | null): LatestRenewalResponse {
		return {
			id: m.id,
			profile_avatar: profileAvatar,
			title_name_th: m.titleNameTh,
			first_name_th: m.firstNameTh,
			last_name_th: m.lastNameTh,
			nickname: m.nickname,
			phone_no: m.phoneNo,
			position: m.positionCode,
			business: { name: m.businessName },
			renewal: {
				id: m.renewalId!,
				payment_date_at: m.renewalPaymentDateAt!.toISOString(),
				payment_slip: paymentSlip!,
			},
		}
	}
}
