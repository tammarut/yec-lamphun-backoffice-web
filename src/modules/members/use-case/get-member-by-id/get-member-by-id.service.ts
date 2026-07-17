import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IEncryptionService } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import { maskIdCard } from "../../domain/mask-id-card"
import type { MemberBusinessReadModel, MemberDetailReadModel } from "../../domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import type { MemberFileUrls } from "../../member-file-url.types"
import { MemberNotFoundError, type GetMemberByIdError } from "./get-member-by-id.errors"
import type { MemberBusinessResponse, MemberDetailResponse } from "./get-member-by-id.types"

/**
 * Use case (query): get a member's detail by id for a detail/edit view.
 *
 * A read-only orchestrator over three collaborators:
 *   1. {@link IMemberRepository.getMemberDetailById} — two queries assemble the read model.
 *   2. {@link IEncryptionService.decrypt} → {@link maskIdCard} — the first plaintext
 *      read path; decrypt failure is non-fatal and degrades `id_card_no` to null
 *      (ADR-0008).
 *   3. {@link MemberFileUrlService} — resolves stored object keys to URLs.
 *
 * Returns AGENTS.md §2B `Promise<Result<MemberDetailResponse, GetMemberByIdError>>`.
 */
@singleton()
export class GetMemberByIdService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.ENCRYPTION_SERVICE) private readonly encryption: IEncryptionService,
		@inject(REGISTER_KEY.MEMBER_FILE_URL_SERVICE) private readonly urlService: MemberFileUrlService
	) {}

	async execute(id: number): Promise<Result<MemberDetailResponse, GetMemberByIdError>> {
		const memberResult = await this.repository.getMemberDetailById(id)
		if (memberResult.isErr()) {
			return err(memberResult.error)
		}
		if (memberResult.value === null) {
			return err(new MemberNotFoundError())
		}
		const member = memberResult.value

		// The repository guarantees business is non-null for a found member (a live
		// member with no business row is corruption → DatabaseError → 500). Guard
		// anyway so a future refactor that bypasses the repo check can't NPE here,
		// and so toResponse receives a narrowed non-nullable type (no `!` asserts).
		// Returns DatabaseError to preserve the documented 500 semantics.
		if (member.business === null) {
			return err(new DatabaseError(`Member ${id} has no live business row (expected 1:1)`))
		}

		const idCardNo = this.decryptAndMask(member.idCardNo)

		const urlsResult = await this.urlService.resolveMemberFileUrls({
			idCardImage: member.idCardImagePath,
			companyCertificate: member.companyCertificatePath,
			profileAvatar: member.profileAvatar,
			logo: member.business.logoFilePath,
			product: member.business.productFilePath,
		})
		// A presign failure is infra-level (R2 down, bad creds) — propagate as
		// err; the route maps StorageError → 500. This is NOT degraded to null
		// (unlike id_card decrypt failure, which is data-level/per-row, ADR-0008):
		// a 200-with-null-URLs would silently lie that the member has no documents
		// when the truth is storage is unreachable.
		if (urlsResult.isErr()) {
			return err(urlsResult.error)
		}

		const memberDetailResponse = this.toResponse(member, member.business, idCardNo, urlsResult.value)
		return ok(memberDetailResponse)
	}

	/**
	 * Decrypt the id_card ciphertext to plaintext, then mask it. Any failure
	 * (decrypt or mask) degrades to `null` + a server-side log — the member was
	 * found, so a single bad column must not brick the detail view (ADR-0008).
	 * The plaintext is born and discarded inside this method; it never crosses a
	 * layer boundary.
	 */
	private decryptAndMask(ciphertext: string): string | null {
		const decrypted = this.encryption.decrypt(ciphertext)
		if (decrypted.isErr()) {
			console.error(`[get-member-by-id] id_card decrypt failed: ${decrypted.error.message}`, { cause: decrypted.error.cause })
			return null
		}

		const masked = maskIdCard(decrypted.value)
		if (masked.isErr()) {
			console.error(`[get-member-by-id] id_card mask failed: ${masked.error.message}`, { cause: masked.error.cause })
			return null
		}

		return masked.value
	}

	private toResponse(m: MemberDetailReadModel, business: MemberBusinessReadModel, idCardNo: string | null, urls: MemberFileUrls): MemberDetailResponse {
		// Location round-trip symmetry: the DB column stores [long, lat] (X,Y geo
		// convention) but the API contract is [lat, long] both ways — the create
		// flow swaps [lat,long]→[long,lat] in MemberBusiness.create on the way in
		// (domain/member-business.ts). Swap back here on the way out so a client
		// that POSTs [lat,long] GETs back [lat,long] for the same record.
		const location = business.location === null ? null : ([business.location[1], business.location[0]] as readonly [number, number])
		const businessResponse: MemberBusinessResponse = {
			id: business.id,
			name: business.name,
			description: business.description,
			juristic_registration_no: business.juristicRegistrationNo,
			category_id: business.categoryId,
			address: business.address,
			location,
			core_business: business.coreBusiness,
			website: business.website,
			logo: urls.logo,
			product: urls.product,
			created_at: business.createdAt.toISOString(),
			updated_at: business.updatedAt.toISOString(),
		}
		return {
			id: m.id,
			registration_type: m.registrationType,
			company_certificate: urls.companyCertificate,
			id_card_image: urls.idCardImage,
			profile_avatar: urls.profileAvatar,
			title_name_th: m.titleNameTh,
			first_name_th: m.firstNameTh,
			last_name_th: m.lastNameTh,
			title_name_en: m.titleNameEn,
			first_name_en: m.firstNameEn,
			last_name_en: m.lastNameEn,
			nickname: m.nickname,
			gender: m.gender,
			// DATE columns serialize as date-only YYYY-MM-DD.
			date_of_birth: m.dateOfBirth.toISOString().slice(0, 10),
			nationality: m.nationality,
			id_card_no: idCardNo,
			id_card_expiry_date: m.idCardExpiryDate.toISOString().slice(0, 10),
			member_since: m.memberSince.toISOString(),
			expires_at: m.expiresAt === null ? null : m.expiresAt.toISOString(),
			phone_no: m.phoneNo,
			email: m.email,
			line_id: m.lineId,
			shirt_size: m.shirtSize,
			position: m.positionCode,
			status: m.status,
			created_at: m.createdAt.toISOString(),
			updated_at: m.updatedAt.toISOString(),
			business: businessResponse,
		}
	}
}
