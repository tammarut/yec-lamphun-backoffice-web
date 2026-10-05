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

/**
 * What the request wants done with the shared business row (#62 D1/D2/D5).
 *
 * The route's ordered valibot union resolves `business` to exactly one of:
 *   - link: `{ business_id }` alone (any extra business fields the client sent
 *     are stripped) — attach the member to an EXISTING live business; on PATCH
 *     this re-links. Never inferred from a juristic-number match.
 *   - create: the full 10-field set — create (POST) or wholesale-edit (PATCH,
 *     ADR-0012 sticky files) of the member's linked shared business.
 *
 * The service resolves the intent against the DB (400 unknown/soft-deleted
 * business_id; 409 juristic collision) and owns the transaction shape for each.
 */
export type MemberBusinessIntent = { readonly kind: "link"; readonly businessId: number } | { readonly kind: "create"; readonly business: CreateMemberBusinessRequest }

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
	readonly business: MemberBusinessIntent
}
