import * as v from "valibot"

/**
 * Client-side valibot mirror of the server's `CreateMemberSchema`
 * (`src/app/api/v1/members/schema.ts`) for the member-creation wizard.
 *
 * Required-ness follows the API, not the mockup's markers (README §8 item 10):
 * nickname, date_of_birth, nationality, id_card_expiry_date,
 * business.juristic_registration_no and business.description are all required.
 * The mirror also front-runs two domain rules so users don't pay a 400
 * round-trip: the 13-digit id-card count (domain strips non-digits, no
 * checksum) and the id-card-expiry ≥ today calendar compare (today valid).
 *
 * The shape is the wire contract with exactly three deliberate deviations,
 * each resolved by `member-wizard-mapping.ts` (the explicit form↔wire layer
 * the card mandates, kept pre-fill friendly for 3b-edit):
 * - the five Member File fields hold `{ file, existingUrl }` pairs (Files are
 *   not serializable into drafts or JSON; edit mode will slot URLs in);
 * - `business.category_id` / `latitude` / `longitude` are strings (HTML select
 *   and text input values) parsed to wire types at the boundary;
 * - empty string means "unset" for every API-optional field.
 */

// --- Enum mirrors (identical literals to the server picklists) --------------

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const
export const SHIRT_SIZES = ["SSS", "SS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const
export const TITLES_TH = ["นาย", "นางสาว", "นาง", "อื่นๆ"] as const
export const TITLES_EN = ["Mr.", "Mrs.", "Ms.", "Miss"] as const
export const POSITIONS = [
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
] as const

// --- Building blocks ---------------------------------------------------------

/** One Member File field: a freshly picked File, an edit-mode URL, or neither. */
const memberFileValue = v.object({
	file: v.union([v.instance(File), v.null()]),
	existingUrl: v.union([v.string(), v.null()]),
})

const emptyMemberFileValue = (): MemberFileValue => ({ file: null, existingUrl: null })

/**
 * DB VARCHAR mirrors (repository/sql/schema.sql, member-business/sql/schema.sql):
 * the API layer has no length checks, so an over-length value would reach
 * Postgres and fail 22001 → 500. Guarded here with Thai messages instead;
 * the wizard inputs also use these as HTML maxLength attributes.
 */
export const DB_MAX_LENGTHS = {
	titleNameTh: 50,
	firstNameTh: 100,
	lastNameTh: 100,
	titleNameEn: 50,
	firstNameEn: 100,
	lastNameEn: 100,
	nickname: 100,
	nationality: 100,
	phoneNo: 30,
	email: 255,
	lineId: 100,
	businessName: 255,
	juristicRegistrationNo: 50,
} as const

/** Required text: non-whitespace (the server checks minLength(1) on raw text), plus the DB column limit when the column is a bounded VARCHAR. */
const requiredText = (message: string, limit?: number) =>
	limit === undefined
		? v.pipe(v.string(), v.trim(), v.minLength(1, message))
		: v.pipe(v.string(), v.trim(), v.minLength(1, message), v.maxLength(limit, `ความยาวต้องไม่เกิน ${limit} ตัวอักษร`))

/** Optional text ("" = unset) bounded by its DB column limit. */
const optionalText = (limit: number) => v.pipe(v.string(), v.maxLength(limit, `ความยาวต้องไม่เกิน ${limit} ตัวอักษร`))

/** Required ISO date from `<input type="date">` ("" = unset). */
const requiredIsoDate = (message: string) =>
	v.pipe(
		v.string(),
		v.check((value) => value !== "", message),
		v.isoDate("รูปแบบวันที่ไม่ถูกต้อง")
	)

/** Local-calendar ISO date — the same compare the domain rule performs. */
function localIsoDateString(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

const PHONE_PATTERN = /^0\d{1,2}-?\d{3}-?\d{3,4}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Optional numeric text ("" allowed) — for the latitude/longitude pair. */
const optionalCoordinate = (label: string) =>
	v.pipe(
		v.string(),
		v.check((value) => value.trim() === "" || Number.isFinite(Number(value)), `${label}ต้องเป็นตัวเลข`)
	)

// --- The schema ---------------------------------------------------------------

/**
 * Shared field map; only `registration_type` (the variant discriminator) and
 * `company_certificate` differ per branch below.
 *
 * The juristic-certificate rule lives inside the JURISTIC_PERSON branch's
 * field schema (a `variant`, not a top-level pipe check) so it fires even
 * when other fields are failing — RHF's resolver parses with
 * `abortPipeEarly: true`, which never reaches a pipe stage appended after an
 * object schema that produced any issue (e.g. empty step-2 fields while the
 * user is still on step 1).
 */
const wizardFields = {
	id_card_image: memberFileValue,
	profile_avatar: memberFileValue,
	title_name_th: v.picklist(TITLES_TH, "กรุณาเลือกคำนำหน้าชื่อ"),
	first_name_th: requiredText("กรุณากรอกชื่อ", DB_MAX_LENGTHS.firstNameTh),
	last_name_th: requiredText("กรุณากรอกนามสกุล", DB_MAX_LENGTHS.lastNameTh),
	title_name_en: v.union([v.picklist(TITLES_EN, "คำนำหน้าชื่อ (EN) ไม่ถูกต้อง"), v.literal("")]),
	first_name_en: optionalText(DB_MAX_LENGTHS.firstNameEn),
	last_name_en: optionalText(DB_MAX_LENGTHS.lastNameEn),
	nickname: requiredText("กรุณากรอกชื่อเล่น", DB_MAX_LENGTHS.nickname),
	gender: v.picklist(GENDERS, "กรุณาเลือกเพศ"),
	date_of_birth: requiredIsoDate("กรุณาเลือกวันเดือนปีเกิด"),
	nationality: requiredText("กรุณากรอกสัญชาติ", DB_MAX_LENGTHS.nationality),
	id_card_no: v.pipe(
		v.string(),
		v.check((value) => value.replace(/\D/g, "").length > 0, "กรุณากรอกเลขบัตรประชาชน"),
		v.check((value) => value.replace(/\D/g, "").length === 13, "เลขบัตรประชาชนต้องมีครบ 13 หลัก")
	),
	id_card_expiry_date: v.pipe(
		v.string(),
		v.check((value) => value !== "", "กรุณาเลือกวันหมดอายุบัตร"),
		v.isoDate("รูปแบบวันที่ไม่ถูกต้อง"),
		v.check((value) => value >= localIsoDateString(new Date()), "วันหมดอายุบัตรต้องไม่เป็นวันที่ผ่านมาแล้ว")
	),
	phone_no: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "กรุณากรอกเบอร์โทรศัพท์"),
		v.check((value) => PHONE_PATTERN.test(value), "รูปแบบเบอร์โทรไม่ถูกต้อง เช่น 081-234-5678"),
		v.maxLength(DB_MAX_LENGTHS.phoneNo, `ความยาวต้องไม่เกิน ${DB_MAX_LENGTHS.phoneNo} ตัวอักษร`)
	),
	email: v.pipe(
		v.string(),
		v.check((value) => value.trim() === "" || EMAIL_PATTERN.test(value.trim()), "รูปแบบอีเมลไม่ถูกต้อง"),
		v.maxLength(DB_MAX_LENGTHS.email, `ความยาวต้องไม่เกิน ${DB_MAX_LENGTHS.email} ตัวอักษร`)
	),
	line_id: optionalText(DB_MAX_LENGTHS.lineId),
	shirt_size: v.union([v.picklist(SHIRT_SIZES, "ไซส์เสื้อไม่ถูกต้อง"), v.literal("")]),
	position: v.picklist(POSITIONS, "กรุณาเลือกตำแหน่งใน YEC Lamphun"),
	business: v.object({
		name: requiredText("กรุณากรอกชื่อกิจการ/ร้านค้า", DB_MAX_LENGTHS.businessName),
		juristic_registration_no: requiredText("กรุณากรอกเลขทะเบียนนิติบุคคล", DB_MAX_LENGTHS.juristicRegistrationNo),
		category_id: v.pipe(
			v.string(),
			v.check((value) => value !== "", "กรุณาเลือกหมวดธุรกิจ"),
			v.check((value) => Number.isInteger(Number(value)) && Number(value) > 0, "กรุณาเลือกหมวดธุรกิจ")
		),
		address: v.string(),
		latitude: optionalCoordinate("ละติจูด"),
		longitude: optionalCoordinate("ลองจิจูด"),
		description: requiredText("กรุณากรอกรายละเอียดกิจการ"),
		core_business: v.string(),
		website: v.string(),
		logo: memberFileValue,
		product: memberFileValue,
	}),
}

export const MemberWizardSchema = v.variant("registration_type", [
	v.object({
		...wizardFields,
		registration_type: v.literal("INDIVIDUAL"),
		company_certificate: memberFileValue,
	}),
	v.object({
		...wizardFields,
		registration_type: v.literal("JURISTIC_PERSON"),
		company_certificate: v.pipe(
			memberFileValue,
			v.check((value) => value.file !== null, "นิติบุคคลต้องแนบหนังสือรับรองบริษัท")
		),
	}),
])

export type MemberWizardFormValues = v.InferInput<typeof MemberWizardSchema>

export type MemberFileValue = { file: File | null; existingUrl: string | null }

/** Per-step field paths (RHF `trigger` names) — step 4 is review-only. */
export const STEP_FIELDS = {
	1: ["registration_type", "company_certificate", "id_card_image"],
	2: [
		"profile_avatar",
		"title_name_th",
		"first_name_th",
		"last_name_th",
		"title_name_en",
		"first_name_en",
		"last_name_en",
		"nickname",
		"gender",
		"date_of_birth",
		"nationality",
		"id_card_no",
		"id_card_expiry_date",
		"phone_no",
		"email",
		"line_id",
		"shirt_size",
		"position",
	],
	3: [
		"business.name",
		"business.juristic_registration_no",
		"business.category_id",
		"business.address",
		"business.latitude",
		"business.longitude",
		"business.description",
		"business.core_business",
		"business.website",
		"business.logo",
		"business.product",
	],
	4: [],
} as const

/** Mockup-v2 defaults: บุคคลธรรมดา / นาย / ชาย / ไทย / สมาชิกทั่วไป, no files. */
export const MEMBER_WIZARD_DEFAULT_VALUES = (): MemberWizardFormValues => ({
	registration_type: "INDIVIDUAL",
	company_certificate: emptyMemberFileValue(),
	id_card_image: emptyMemberFileValue(),
	profile_avatar: emptyMemberFileValue(),
	title_name_th: "นาย",
	first_name_th: "",
	last_name_th: "",
	title_name_en: "",
	first_name_en: "",
	last_name_en: "",
	nickname: "",
	gender: "MALE",
	date_of_birth: "",
	nationality: "ไทย",
	id_card_no: "",
	id_card_expiry_date: "",
	phone_no: "",
	email: "",
	line_id: "",
	shirt_size: "",
	position: "GENERAL_MEMBER",
	business: {
		name: "",
		juristic_registration_no: "",
		category_id: "",
		address: "",
		latitude: "",
		longitude: "",
		description: "",
		core_business: "",
		website: "",
		logo: emptyMemberFileValue(),
		product: emptyMemberFileValue(),
	},
})
