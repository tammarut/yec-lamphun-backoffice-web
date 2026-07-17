/**
 * Read models for the members domain.
 *
 * These are the typed shapes the repository returns to the service. They map
 * snake_case DB columns to camelCase TS fields (the conversion happens in the
 * repository, which adapts sqlc's generated rows). Pure data — no behavior.
 */

export type PositionCardinality = "SINGLE" | "MULTIPLE"

export interface PositionReadModel {
	readonly code: string
	readonly nameTh: string
	readonly nameEn: string
	readonly cardinality: PositionCardinality
	readonly parentPositionCode: string | null
	readonly displayOrder: number
	readonly isActive: boolean
}

/** The document types accepted by member_documents.type (CHECK constraint). */
export type MemberDocumentType = "ID_CARD" | "COMPANY_CERTIFICATE" | "PAYMENT_SLIP"

/**
 * Read model for a member's single business record (1:1 with the member).
 *
 * `location` is in **DB/storage order `[longitude, latitude]`** (X,Y geo
 * convention), a faithful picture of the row. The GET service's response mapper
 * swaps it back to `[lat, long]` for the API contract — round-trip symmetry
 * with the create request body, which sends `[lat, long]` (see
 * domain/member-business.ts swapLatLong). `logoFilePath` / `productFilePath`
 * are stored R2 object keys; the service resolves them to URLs via
 * MemberFileUrlService.
 */
export interface MemberBusinessReadModel {
	readonly id: number
	readonly name: string
	readonly description: string
	readonly juristicRegistrationNo: string
	readonly categoryId: number
	readonly address: string | null
	readonly location: readonly [number, number] | null
	readonly coreBusiness: string | null
	readonly website: string | null
	readonly logoFilePath: string | null
	readonly productFilePath: string | null
	readonly createdAt: Date
	readonly updatedAt: Date
}

/**
 * Read model for the GET-member-detail query. DB-shaped, camelCase, with
 * `Date` objects and raw file paths/keys. `idCardNo` is still AES-256-GCM
 * ciphertext at this layer; the service decrypts + masks it.
 *
 * `positionCode` is shipped verbatim (the frontend maps it to a Thai display
 * name) — no positions JOIN needed (per the grilling Q8 decision).
 */
export interface MemberDetailReadModel {
	readonly id: number
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
	readonly idCardNo: string
	readonly idCardExpiryDate: Date
	readonly memberSince: Date
	readonly expiresAt: Date | null
	readonly profileAvatar: string | null
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly shirtSize: string | null
	readonly positionCode: string
	readonly status: "ACTIVE" | "EXPIRED" | "PENDING_RENEWAL" | "RESIGNED"
	readonly createdAt: Date
	readonly updatedAt: Date
	/** 1:1 business record; the repository guarantees this is non-null for a live member (else 500). */
	readonly business: MemberBusinessReadModel | null
	/** Latest non-deleted ID_CARD document path, or null if none. */
	readonly idCardImagePath: string | null
	/** Latest non-deleted COMPANY_CERTIFICATE document path, or null if none. */
	readonly companyCertificatePath: string | null
}
