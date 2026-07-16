/**
 * The validated request DTO the route passes to CreateNewMemberService.
 *
 * This is the OUTPUT of Valibot's safeParse at the route boundary — structural
 * validation (types, enums, formats) is already done. Semantic business rules
 * (id_card_expiry vs today, position cardinality) are enforced by the service /
 * domain layer, not by the type.
 */

export type CreateMemberBusinessRequest = {
	readonly name: string
	readonly juristicRegistrationNo: string
	readonly categoryId: number
	readonly address: string | null
	/** [lat, long] as received from the client, or null if not provided. */
	readonly location: readonly [number, number] | null
	readonly description: string
	readonly coreBusiness: string | null
	readonly website: string | null
	readonly logo: string | null
	readonly product: string | null
}

export type CreateMemberRequest = {
	readonly registrationType: "INDIVIDUAL" | "JURISTIC_PERSON"
	readonly companyCertificate: string | null
	readonly idCardImage: string | null
	readonly profileAvatar: string | null
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
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly shirtSize: string | null
	readonly position: string
	readonly business: CreateMemberBusinessRequest
}
