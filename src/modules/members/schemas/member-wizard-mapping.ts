import type { MemberFileValue, MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

/**
 * The explicit form↔wire mapping layer between `MemberWizardFormValues` and
 * the JSON body of POST /api/v1/members (mirrors `CreateMemberSchema`):
 * uploaded file paths replace the `{ file, existingUrl }` pairs, lat/long
 * strings parse into the wire `[lat, long]` pair, empty optionals become
 * JSON null, and `shirt_size` — which the API accepts only as a valid enum
 * value or absent — is omitted entirely when unset.
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

/** Human label for a Member File field in review/summaries: file name or "ไม่ได้แนบ". */
export function memberFileLabel(value: MemberFileValue): string {
	return value.file?.name ?? "ไม่ได้แนบ"
}
