import { array, check, integer, isoDate, minLength, null_, number, object, optional, picklist, pipe, string, transform, union, type InferOutput } from "valibot"

/**
 * Structural request schema for POST /api/v1/members.
 *
 * Validates TYPES, REQUIRED-ness, ENUMS, and FORMATS only. Semantic business
 * rules (id_card_expiry ≥ today, position cardinality) live in the domain layer
 * — see AGENTS.md and the create-new-member use case. Dates arrive as ISO strings
 * from JSON and are transformed to Date objects here so the service receives
 * the typed shape it expects.
 */

// --- Enums (picklist preserves literal union types for the service DTO) ----
const RegistrationTypeSchema = picklist(["INDIVIDUAL", "JURISTIC_PERSON"])
const GenderSchema = picklist(["MALE", "FEMALE", "OTHER"])
const ShirtSizeSchema = picklist(["SSS", "SS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"])
const TitleNameThSchema = picklist(["นาย", "นางสาว", "นาง", "อื่นๆ"])
const TitleNameEnSchema = picklist(["Mr.", "Mrs.", "Ms.", "Miss"])
const PositionSchema = picklist([
	"GENERAL_MEMBER",
	"PRESIDENT",
	"ADVISORY_BOARD",
	"SECRETARY",
	"TREASURER",
	"ASST_SECRETARY",
	"LEGAL_COORDINATOR",
	"VP_ADMIN_INTERNAL",
	"VP_BUSINESS_INNOVATION",
	"VP_NETWORK_INTERNATIONAL",
	"VP_PR_IMAGE",
	"VP_ACTIVITIES_RELATIONS",
	"VP_DATA_REGISTRATION",
	"COMM_ADMIN_INTERNAL",
	"COMM_BUSINESS_INNOVATION",
	"COMM_NETWORK_INTERNATIONAL",
	"COMM_PR_IMAGE",
	"COMM_ACTIVITIES_RELATIONS",
	"COMM_DATA_REGISTRATION",
])

// Nullable-string helper: a field that is either a string or JSON null.
const nullableString = union([string(), null_()])

// ISO date string → Date. string() is the schema; isoDate() validates the ISO
// 8601 format; transform converts the validated string to a Date for the service.
const isoDateToDate = pipe(
	string(),
	isoDate(),
	transform((s) => new Date(s))
)

// Location: a 2-element array of numbers [lat, long]. Cardinality validated here;
// the [lat,long]→[long,lat] swap happens in the service.
const locationSchema = pipe(
	array(number()),
	check((arr) => arr.length === 2, "location must be a [lat, long] pair"),
	transform((arr) => [arr[0]!, arr[1]!] as [number, number])
)

const categoryIdSchema = pipe(
	number(),
	integer(),
	check((n) => n > 0, "category_id must be a positive integer")
)

export const CreateMemberSchema = object({
	registration_type: RegistrationTypeSchema,
	company_certificate: nullableString,
	id_card_image: nullableString,
	profile_avatar: nullableString,
	title_name_th: TitleNameThSchema,
	first_name_th: pipe(string(), minLength(1, "first_name_th is required")),
	last_name_th: pipe(string(), minLength(1, "last_name_th is required")),
	title_name_en: optional(union([TitleNameEnSchema, null_()])),
	first_name_en: optional(nullableString),
	last_name_en: optional(nullableString),
	nickname: pipe(string(), minLength(1, "nickname is required")),
	gender: GenderSchema,
	date_of_birth: isoDateToDate,
	nationality: pipe(string(), minLength(1, "nationality is required")),
	id_card_no: pipe(string(), minLength(1, "id_card_no is required")),
	id_card_expiry_date: isoDateToDate,
	phone_no: pipe(string(), minLength(1, "phone_no is required")),
	email: optional(nullableString),
	line_id: optional(nullableString),
	shirt_size: optional(ShirtSizeSchema),
	position: PositionSchema,
	business: object({
		name: pipe(string(), minLength(1, "business.name is required")),
		juristic_registration_no: pipe(string(), minLength(1, "business.juristic_registration_no is required")),
		category_id: categoryIdSchema,
		address: optional(nullableString),
		location: optional(union([locationSchema, null_()])),
		description: pipe(string(), minLength(1, "business.description is required")),
		core_business: optional(nullableString),
		website: optional(nullableString),
		logo: optional(nullableString),
		product: optional(nullableString),
	}),
})

export type CreateMemberSchemaOutput = InferOutput<typeof CreateMemberSchema>
