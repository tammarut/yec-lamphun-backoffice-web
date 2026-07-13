import { err, ok, type Result } from "neverthrow"
import type { IBlindIndexService, IEncryptionService } from "src/modules/shared/crypto"
import { CryptoError } from "src/modules/shared/crypto"
import type { CreateMemberRequest } from "../use-case/create-new-member/create-member.types"
import { MemberValidationError } from "./errors"
import { IdCard } from "./id-card"
import type { IdCardCipher } from "./id-card"
import { validateIdCardExpiry } from "./id-card-expiry"
import { MemberBusiness } from "./member-business"
import { MemberDocument } from "./member-document"
import type { MemberDocumentType, PositionReadModel } from "./member-read-models"

/**
 * Concrete property bag for a fully-validated Member.
 * Value objects (IdCard cipher, MemberBusiness, MemberDocument[]) are stored
 * directly — no lazy references to the request DTO.
 */
export type MemberProps = {
	readonly registrationType: "INDIVIDUAL" | "JURISTIC_PERSON"
	readonly titleNameTh: string
	readonly firstNameTh: string
	readonly lastNameTh: string
	readonly titleNameEn: string | null
	readonly firstNameEn: string | null
	readonly lastNameEn: string | null
	readonly nickname: string
	readonly gender: "MALE" | "FEMALE" | "OTHER"
	readonly dateOfBirth: Date
	readonly nationality: string
	readonly idCardCipher: IdCardCipher
	readonly idCardExpiryDate: Date
	readonly memberSince: Date
	readonly expiresAt: Date
	readonly profileAvatar: string | null
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly shirtSize: string | null
	readonly positionCode: string
	readonly status: "ACTIVE"
	readonly renewalSuccessfulCount: 0
	readonly documents: readonly MemberDocument[]
	readonly business: MemberBusiness
}

/**
 * A fully-validated, persistence-ready Member.
 *
 * Constructed exclusively through {@link create} (enforces self-invariants) or
 * {@link fromDb} (trusts persisted data). No setters — all access is via
 * getters. The service passes this aggregate directly to the repository; the
 * repository maps the getters to sqlc's generated arg objects.
 *
 * Named for the domain concept (not "MemberAggregate") to match the Mercular
 * precedent (class ProductStock, not class ProductStockAggregate).
 */
export class Member {
	private constructor(private readonly props: MemberProps) {}

	// --- Getters (Read-Only Access) ---

	get registrationType() {
		return this.props.registrationType
	}
	get titleNameTh() {
		return this.props.titleNameTh
	}
	get firstNameTh() {
		return this.props.firstNameTh
	}
	get lastNameTh() {
		return this.props.lastNameTh
	}
	get titleNameEn() {
		return this.props.titleNameEn
	}
	get firstNameEn() {
		return this.props.firstNameEn
	}
	get lastNameEn() {
		return this.props.lastNameEn
	}
	get nickname() {
		return this.props.nickname
	}
	get gender() {
		return this.props.gender
	}
	get dateOfBirth() {
		return this.props.dateOfBirth
	}
	get nationality() {
		return this.props.nationality
	}
	get idCardNo() {
		return this.props.idCardCipher.idCardNo
	}
	get idCardNoHash() {
		return this.props.idCardCipher.idCardNoHash
	}
	get idCardExpiryDate() {
		return this.props.idCardExpiryDate
	}
	get memberSince() {
		return this.props.memberSince
	}
	get expiresAt() {
		return this.props.expiresAt
	}
	get profileAvatar() {
		return this.props.profileAvatar
	}
	get phoneNo() {
		return this.props.phoneNo
	}
	get email() {
		return this.props.email
	}
	get lineId() {
		return this.props.lineId
	}
	get shirtSize() {
		return this.props.shirtSize
	}
	get positionCode() {
		return this.props.positionCode
	}
	get status() {
		return this.props.status
	}
	get renewalSuccessfulCount() {
		return this.props.renewalSuccessfulCount
	}
	get documents() {
		return this.props.documents
	}
	get business() {
		return this.props.business
	}

	// --- Factory: New Member Creation ---
	// Enforces ALL self-invariants. Used by CreateNewMemberService.

	/**
	 * Validate and assemble a Member from a request + a fetched position.
	 *
	 * Owns the self-invariants:
	 *   - id_card_expiry_date must not be before today
	 *   - id_card_no must be 13 digits
	 *   - position must be active
	 *   - id_card is encrypted + hashed
	 *   - membership defaults are computed (status, member_since, expires_at, count)
	 *   - business VO is created (owns the [lat,long]→[long,lat] swap)
	 *   - documents are collected from the request file paths
	 *
	 * Does NOT own cross-member rules (duplicate id_card, occupied SINGLE
	 * position) — those require DB queries and live in the use case.
	 */
	static create(
		req: CreateMemberRequest,
		position: PositionReadModel,
		encryption: IEncryptionService,
		blindIndex: IBlindIndexService,
		now: Date
	): Result<Member, MemberValidationError | CryptoError> {
		// Self-invariant: id_card must not already be expired.
		const expiryCheck = validateIdCardExpiry(req.idCardExpiryDate, now)
		if (expiryCheck.isErr()) {
			return err(expiryCheck.error)
		}

		// Self-invariant: position must be active.
		if (!position.isActive) {
			return err(new MemberValidationError(`Position ${position.code} is not active`))
		}

		// Self-invariant: id_card format, then encrypt + hash.
		const idCard = IdCard.fromPlaintext(req.idCardNo)
		if (idCard.isErr()) {
			return err(idCard.error)
		}
		const cipher = idCard.value.toCipher(encryption, blindIndex)
		if (cipher.isErr()) {
			return err(cipher.error)
		}

		// Self-invariant: business VO (owns the location swap).
		const businessResult = MemberBusiness.create({
			name: req.business.name,
			description: req.business.description,
			juristicRegistrationNo: req.business.juristicRegistrationNo,
			categoryId: req.business.categoryId,
			address: req.business.address,
			location: req.business.location,
			coreBusiness: req.business.coreBusiness,
			website: req.business.website,
			logo: req.business.logo,
			product: req.business.product,
		})
		if (businessResult.isErr()) {
			return err(businessResult.error)
		}

		// Collect documents: ID_CARD (from id_card_image) + COMPANY_CERTIFICATE.
		const documents = collectDocuments(req)

		// Compute membership defaults: status=ACTIVE, member_since=now,
		// expires_at = end of day one year from now, renewal count = 0.
		const expiresAt = Member.computeExpiry(now)

		return ok(
			new Member({
				registrationType: req.registrationType,
				titleNameTh: req.titleNameTh,
				firstNameTh: req.firstNameTh,
				lastNameTh: req.lastNameTh,
				titleNameEn: req.titleNameEn,
				firstNameEn: req.firstNameEn,
				lastNameEn: req.lastNameEn,
				nickname: req.nickname,
				gender: req.gender,
				dateOfBirth: req.dateOfBirth,
				nationality: req.nationality,
				idCardCipher: cipher.value,
				idCardExpiryDate: req.idCardExpiryDate,
				memberSince: now,
				expiresAt: expiresAt,
				profileAvatar: req.profileAvatar,
				phoneNo: req.phoneNo,
				email: req.email,
				lineId: req.lineId,
				shirtSize: req.shirtSize,
				positionCode: req.position,
				status: "ACTIVE",
				renewalSuccessfulCount: 0,
				documents: documents,
				business: businessResult.value,
			})
		)
	}

	/**
	 * expires_at = end of the day exactly one calendar year after `now`.
	 * "now + 1 year (end of day)": add one year, then set time to 23:59:59.999.
	 */
	private static computeExpiry(now: Date): Date {
		const expiresAt = new Date(now)
		expiresAt.setFullYear(expiresAt.getFullYear() + 1)
		expiresAt.setHours(23, 59, 59, 999)

		return expiresAt
	}

	// --- Factory: From Database ---
	// Trusts persisted data. Skips validation. Used ONLY by Repository.
	static fromDb(props: MemberProps): Member {
		return new Member(props)
	}
}

/** Collect the document VOs implied by the request (ID_CARD + COMPANY_CERTIFICATE). */
function collectDocuments(req: CreateMemberRequest): readonly MemberDocument[] {
	const docs: MemberDocument[] = []
	if (req.idCardImage) {
		docs.push(MemberDocument.create("ID_CARD" satisfies MemberDocumentType, req.idCardImage))
	}
	if (req.companyCertificate) {
		docs.push(MemberDocument.create("COMPANY_CERTIFICATE" satisfies MemberDocumentType, req.companyCertificate))
	}
	return docs
}
