import type { MemberStatus } from "src/modules/members/components/members-types"
import type { MemberFileValue, MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"

/**
 * The explicit form↔wire mapping layer between `MemberWizardFormValues` and
 * the JSON bodies of POST / PATCH /api/v1/members (mirrors the server
 * schemas): uploaded file paths replace the `{ file, existingUrl }` pairs,
 * lat/long strings parse into the wire `[lat, long]` pair, empty optionals
 * become JSON null, and `shirt_size` — which the API accepts only as a valid
 * enum value or absent — is omitted entirely when unset. The edit direction
 * (GET /:id → form values) lives in `memberDetailToFormValues` below.
 */

/** The five `*_file_path` keys of POST /api/v1/members/file/upload's response that member creation consumes. */
export type UploadedFilePaths = {
	readonly id_card_image_file_path: string | null
	readonly company_certificate_file_path: string | null
	readonly profile_avatar_file_path: string | null
	readonly business_logo_file_path: string | null
	readonly business_product_file_path: string | null
}

/** The POST /api/v1/members request body (snake_case wire contract). */
export type CreateMemberApiPayload = {
	registration_type: MemberWizardFormValues["registration_type"]
	company_certificate: string | null
	id_card_image: string | null
	profile_avatar: string | null
	title_name_th: MemberWizardFormValues["title_name_th"]
	first_name_th: string
	last_name_th: string
	title_name_en: MemberWizardFormValues["title_name_en"] | null
	first_name_en: string | null
	last_name_en: string | null
	nickname: string
	gender: MemberWizardFormValues["gender"]
	date_of_birth: string
	nationality: string
	id_card_no: string
	id_card_expiry_date: string
	phone_no: string
	email: string | null
	line_id: string | null
	shirt_size?: MemberWizardFormValues["shirt_size"]
	position: MemberWizardFormValues["position"]
	business: {
		name: string
		juristic_registration_no: string
		category_id: number
		address: string | null
		location: [number, number] | null
		description: string
		core_business: string | null
		website: string | null
		logo: string | null
		product: string | null
	}
}

const textOrNull = (value: string): string | null => (value.trim() === "" ? null : value.trim())

const pathOrNull = (uploads: UploadedFilePaths | null, key: keyof UploadedFilePaths): string | null => (uploads === null ? null : uploads[key])

function locationOrNull(values: MemberWizardFormValues): [number, number] | null {
	const latitude = values.business.latitude.trim()
	const longitude = values.business.longitude.trim()
	if (latitude === "" || longitude === "") {
		return null
	}
	return [Number(latitude), Number(longitude)]
}

/** The PATCH /api/v1/members/{id} request body — the create payload with the null-sticky id_card_no. */
export type UpdateMemberApiPayload = Omit<CreateMemberApiPayload, "id_card_no"> & {
	id_card_no: string | null
}

export function buildCreatePayload(values: MemberWizardFormValues, uploads: UploadedFilePaths | null): CreateMemberApiPayload {
	return {
		registration_type: values.registration_type,
		company_certificate: pathOrNull(uploads, "company_certificate_file_path"),
		id_card_image: pathOrNull(uploads, "id_card_image_file_path"),
		profile_avatar: pathOrNull(uploads, "profile_avatar_file_path"),
		title_name_th: values.title_name_th,
		first_name_th: values.first_name_th.trim(),
		last_name_th: values.last_name_th.trim(),
		title_name_en: values.title_name_en === "" ? null : values.title_name_en,
		first_name_en: textOrNull(values.first_name_en),
		last_name_en: textOrNull(values.last_name_en),
		nickname: values.nickname.trim(),
		gender: values.gender,
		date_of_birth: values.date_of_birth,
		nationality: values.nationality.trim(),
		id_card_no: values.id_card_no,
		id_card_expiry_date: values.id_card_expiry_date,
		phone_no: values.phone_no.trim(),
		email: textOrNull(values.email),
		line_id: textOrNull(values.line_id),
		...(values.shirt_size === "" ? {} : { shirt_size: values.shirt_size }),
		position: values.position,
		business: {
			name: values.business.name.trim(),
			juristic_registration_no: values.business.juristic_registration_no.trim(),
			category_id: Number(values.business.category_id),
			address: textOrNull(values.business.address),
			location: locationOrNull(values),
			description: values.business.description.trim(),
			core_business: textOrNull(values.business.core_business),
			website: textOrNull(values.business.website),
			logo: pathOrNull(uploads, "business_logo_file_path"),
			product: pathOrNull(uploads, "business_product_file_path"),
		},
	}
}

/**
 * The edit-mode payload (PATCH): identical to the create payload except
 * `id_card_no` — blank submits null, which the API's null-sticky rule
 * resolves to "keep the stored card" (GET /:id exposes only the masked
 * value, so the form can never echo the plaintext back).
 *
 * File paths reuse the create helper unchanged: a changed file rides the
 * upload response's path, an unchanged/absent file sends null (sticky keep).
 */
export function buildUpdatePayload(values: MemberWizardFormValues, uploads: UploadedFilePaths | null): UpdateMemberApiPayload {
	return {
		...buildCreatePayload(values, uploads),
		id_card_no: values.id_card_no.trim() === "" ? null : values.id_card_no.trim(),
	}
}

/**
 * Auto-computed readonly อายุ label ("X ปี Y เดือน", months only under a
 * year) from a date-of-birth ISO string; "" when unset/unparseable. The
 * day-of-month borrow keeps "2 days before the birthday" at 11 months.
 */
export function computeAgeLabel(dateOfBirthIso: string, now: Date = new Date()): string {
	if (dateOfBirthIso === "") {
		return ""
	}
	const dob = new Date(`${dateOfBirthIso}T00:00:00`)
	if (Number.isNaN(dob.getTime())) {
		return ""
	}
	let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth())
	if (now.getDate() < dob.getDate()) {
		months -= 1
	}
	if (months < 0) {
		return ""
	}
	const years = Math.floor(months / 12)
	const remainingMonths = months % 12
	if (years === 0) {
		return `${remainingMonths} เดือน`
	}
	return `${years} ปี ${remainingMonths} เดือน`
}

/** Filename of a stored Member File, decoded from its (presigned or public) URL; "ไฟล์เดิม" when undecodable. */
export function fileLabelFromUrl(url: string): string {
	try {
		const path = new URL(url).pathname
		const name = decodeURIComponent(
			path
				.split("/")
				.filter((segment) => segment !== "")
				.at(-1) ?? ""
		)
		return name === "" ? "ไฟล์เดิม" : name
	} catch {
		return "ไฟล์เดิม"
	}
}

/** Human label for a Member File field in review/summaries: staged name, stored filename, or "ไม่ได้แนบ". */
export function memberFileLabel(value: MemberFileValue): string {
	if (value.file !== null) {
		return value.file.name
	}
	return value.existingUrl !== null ? fileLabelFromUrl(value.existingUrl) : "ไม่ได้แนบ"
}

/** Thai short-date display for a membership timestamp (renewal block / review). */
export function formatThaiDate(isoDateTime: string): string {
	const date = new Date(isoDateTime)
	if (Number.isNaN(date.getTime())) {
		return "-"
	}
	return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
}

/** ระยะเวลาการเป็นสมาชิก label, computed from member_since ("X ปี Y เดือน"; "-" when unparseable). */
export function membershipDurationLabel(memberSinceIso: string, now: Date = new Date()): string {
	const label = computeAgeLabel(memberSinceIso.slice(0, 10), now)
	return label === "" ? "-" : label
}

/**
 * The edit-mode pre-fill (GET /:id → form values), the inverse of the payload
 * builders above:
 * - `id_card_no` maps to "" — the Masked ID Card NEVER enters form state; a
 *   blank submits null and the API keeps the stored card (null-sticky).
 * - `phone_no` runs through `formatPhoneNumber`, which is idempotent: legacy
 *   rows arrive mixed digits/dashes and re-format to the canonical dashed
 *   form, which is itself the stored value (submit keeps the dashes).
 * - `business.location` arrives `[long, lat]` (storage order) and splits into
 *   the two string inputs; the payload builders write back `[lat, long]`.
 * - File fields slot the resolved URLs into `{ file: null, existingUrl }` —
 *   private files carry 1-hour presigned URLs minted by GET /:id.
 * - Null optionals become the "" sentinel; `shirt_size`/`category_id` map to
 *   their string form values.
 */
export function memberDetailToFormValues(detail: MemberDetailResponse): MemberWizardFormValues {
	const existingFile = (url: string | null): MemberFileValue => ({ file: null, existingUrl: url })
	// The response types the enum-ish columns as plain string; the DB stores
	// the same enum domains the server validated on write, so the cast is the
	// honest statement of that invariant at the mapping boundary.
	return {
		registration_type: detail.registration_type,
		company_certificate: existingFile(detail.company_certificate),
		id_card_image: existingFile(detail.id_card_image),
		profile_avatar: existingFile(detail.profile_avatar),
		title_name_th: detail.title_name_th as MemberWizardFormValues["title_name_th"],
		first_name_th: detail.first_name_th,
		last_name_th: detail.last_name_th,
		title_name_en: (detail.title_name_en ?? "") as MemberWizardFormValues["title_name_en"],
		first_name_en: detail.first_name_en ?? "",
		last_name_en: detail.last_name_en ?? "",
		nickname: detail.nickname,
		gender: detail.gender,
		date_of_birth: detail.date_of_birth,
		nationality: detail.nationality,
		id_card_no: "",
		id_card_expiry_date: detail.id_card_expiry_date,
		phone_no: formatPhoneNumber(detail.phone_no),
		email: detail.email ?? "",
		line_id: detail.line_id ?? "",
		shirt_size: (detail.shirt_size ?? "") as MemberWizardFormValues["shirt_size"],
		position: detail.position as MemberWizardFormValues["position"],
		business: {
			name: detail.business.name,
			juristic_registration_no: detail.business.juristic_registration_no,
			category_id: String(detail.business.category_id),
			address: detail.business.address ?? "",
			latitude: detail.business.location === null ? "" : String(detail.business.location[1]),
			longitude: detail.business.location === null ? "" : String(detail.business.location[0]),
			description: detail.business.description,
			core_business: detail.business.core_business ?? "",
			website: detail.business.website ?? "",
			logo: existingFile(detail.business.logo),
			product: existingFile(detail.business.product),
		},
	}
}

/** The renewal block's read-only display data in edit mode (renewal-owned, card 04). */
export type MemberRenewalDisplay = {
	memberSince: string
	status: MemberStatus
}

/**
 * Display mask for เลขบัตรประชาชน: digits-only in, "X-XXXX-XXXXX-XX-X" out
 * (grouped 1-4-5-2-1, capped at 13 digits, non-digits dropped) — the form
 * value itself stays digits-only for validation and the wire payload.
 */
export function formatIdCardNo(raw: string): string {
	const digits = raw.replace(/\D/g, "").slice(0, 13)
	const groups = [digits.slice(0, 1), digits.slice(1, 5), digits.slice(5, 10), digits.slice(10, 12), digits.slice(12, 13)]
	return groups.filter((group) => group !== "").join("-")
}

/**
 * Display mask for เบอร์โทรศัพท์: "xxx-xxx-xxxx" (3-3-4, capped at 10 digits,
 * non-digits dropped, partial last group for 9-digit landlines). Unlike
 * `formatIdCardNo`, the DASHED string is itself the stored form value
 * (decision: keep dashes), so this is safe to feed back through on every
 * keystroke — formatting an already-masked value is a no-op.
 */
export function formatPhoneNumber(raw: string): string {
	const digits = raw.replace(/\D/g, "").slice(0, 10)
	const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)]
	return groups.filter((group) => group !== "").join("-")
}
