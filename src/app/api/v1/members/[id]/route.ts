import { integer, minValue, pipe, safeParse, string, transform } from "valibot"
import { NextRequest, NextResponse } from "next/server"
import { ResultAsync } from "neverthrow"
import "reflect-metadata"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberConflictError, MemberValidationError } from "src/modules/members/use-case/create-new-member/create-member.errors"
import type { CreateMemberRequest } from "src/modules/members/use-case/create-new-member/create-member.types"
import { MemberNotFoundError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import type { GetMemberByIdError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"
import type { UpdateMemberError } from "src/modules/members/use-case/update-member/update-member.errors"
import { UpdateMemberService } from "src/modules/members/use-case/update-member/update-member.service"
import { createLogger } from "src/shared/lib/logger/logger"
import { PatchMemberSchema, type PatchMemberSchemaOutput } from "../schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "get-by-id"])
const patchLogger = createLogger(["members", "route", "update-by-id"])

// Next 16: dynamic route params are a Promise. We await it before reading id.
type MemberRouteContext = { params: Promise<{ id: string }> }

// Inline id validation (grilling Q9a): parse the string path param into an
// integer > 0. No separate schema file — one integer field doesn't earn one,
// matching the thin read-side route convention (business/categories, etc.).
// NaN fails the integer() check, so non-numeric ids are rejected here.
const IdParamSchema = pipe(
	string(),
	transform((v) => Number(v)),
	integer(),
	minValue(1)
)

export const GET = withAuth<MemberDetailResponse | ResponseBodyError>(async function GET(_request, context): Promise<NextResponse<MemberDetailResponse | ResponseBodyError>> {
	const ctx = context as MemberRouteContext
	const { id: rawId } = await ctx.params

	const parsed = safeParse(IdParamSchema, rawId)
	if (!parsed.success) {
		return NextResponse.json({ error_message: "id parameter must be a valid integer" } satisfies ResponseBodyError, { status: 400 })
	}

	const service = container.resolve<GetMemberByIdService>(REGISTER_KEY.GET_MEMBER_BY_ID_SERVICE)
	const result = await service.execute(parsed.output)
	if (result.isErr()) {
		return mapGetError(result.error)
	}

	return NextResponse.json(result.value)
})

// ============================================================================
// PATCH /api/v1/members/:id — update an existing member (ADR-0012).
// Staff-only (withAuth), overriding the spec's `security: []` (grilling Q7 —
// every write route in this codebase is withAuth; the spec's empty security
// is treated as a copy-paste artifact).
//
// Hybrid PATCH semantics: the body is the full CreateNewMemberRequest object,
// but the five file-path fields (profile_avatar, id_card_image,
// company_certificate, business.logo, business.product) treat JSON null as
// "leave existing value unchanged"; all scalar fields write through. The
// stickiness is enforced in the service, not the schema (ADR-0012).
//
// Success → 204 No Content (empty body), per spec. Errors → { error_message }.
// ============================================================================
export const PATCH = withAuth<ResponseBodyError>(async function PATCH(request: NextRequest, context): Promise<NextResponse<ResponseBodyError>> {
	const ctx = context as MemberRouteContext
	const { id: rawId } = await ctx.params

	// 1. Validate the path-param id (same rule as GET).
	const idParsed = safeParse(IdParamSchema, rawId)
	if (!idParsed.success) {
		return NextResponse.json({ error_message: "id parameter must be a valid integer" } satisfies ResponseBodyError, { status: 400 })
	}

	// 2. Parse JSON body.
	const parseBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseBodyResult.isErr()) {
		return NextResponse.json({ error_message: "Invalid request body" } satisfies ResponseBodyError, { status: 400 })
	}

	// 3. Structural validation (types, enums, formats) via Valibot. The
	//    PATCH-specific sticky-file semantics are NOT enforced here.
	const parsed = safeParse(PatchMemberSchema, parseBodyResult.value)
	if (!parsed.success) {
		const issue = parsed.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}

	// 4. Hand the id + validated DTO to the use case.
	const service = container.resolve<UpdateMemberService>(REGISTER_KEY.UPDATE_MEMBER_SERVICE)
	const updateReq = toServiceRequest(parsed.output)
	const result = await service.execute(idParsed.output, updateReq)
	if (result.isErr()) {
		return mapPatchError(result.error)
	}

	// 5. 204 No Content — success with no response body, per spec.
	return new NextResponse(null, { status: 204 })
})

/** Map a GetMemberByIdError to its HTTP status + body. */
function mapGetError(error: GetMemberByIdError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	// DatabaseError (incl. missing-business corruption, Q6/iii-a) and StorageError
	// (presign failure — infra-level) → 500, no leaky details. CryptoError is never
	// propagated (swallowed to null in the service per ADR-0008), so it is not in
	// the GetMemberByIdError union.
	logger.error("members/get-by-id failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}

/** Map an UpdateMemberError to its HTTP status + body. */
function mapPatchError(error: UpdateMemberError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberValidationError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 400 })
	}
	if (error instanceof MemberNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	if (error instanceof MemberConflictError) {
		// Both conflict reasons (DUPLICATE_ID_CARD, POSITION_OCCUPIED) map to 409.
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 409 })
	}
	// CryptoError and DatabaseError are infra failures → 500, no leaky details.
	patchLogger.error("members/update-by-id failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}

/** Map the snake_case Valibot output to the camelCase service DTO. */
function toServiceRequest(o: PatchMemberSchemaOutput): CreateMemberRequest {
	return {
		registrationType: o.registration_type,
		companyCertificate: o.company_certificate,
		idCardImage: o.id_card_image,
		profileAvatar: o.profile_avatar,
		titleNameTh: o.title_name_th,
		firstNameTh: o.first_name_th,
		lastNameTh: o.last_name_th,
		titleNameEn: o.title_name_en ?? null,
		firstNameEn: o.first_name_en ?? null,
		lastNameEn: o.last_name_en ?? null,
		nickname: o.nickname,
		gender: o.gender,
		dateOfBirth: o.date_of_birth,
		nationality: o.nationality,
		idCardNo: o.id_card_no,
		idCardExpiryDate: o.id_card_expiry_date,
		phoneNo: o.phone_no,
		email: o.email ?? null,
		lineId: o.line_id ?? null,
		shirtSize: o.shirt_size ?? null,
		position: o.position,
		business: {
			name: o.business.name,
			juristicRegistrationNo: o.business.juristic_registration_no,
			categoryId: o.business.category_id,
			address: o.business.address ?? null,
			location: o.business.location ?? null,
			description: o.business.description,
			coreBusiness: o.business.core_business ?? null,
			website: o.business.website ?? null,
			logo: o.business.logo ?? null,
			product: o.business.product ?? null,
		},
	}
}
