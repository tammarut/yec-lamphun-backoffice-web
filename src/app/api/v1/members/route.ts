import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberConflictError, MemberValidationError } from "src/modules/members/use-case/create-new-member/create-member.errors"
import type { CreateMemberRequest } from "src/modules/members/use-case/create-new-member/create-member.types"
import { CreateNewMemberService } from "src/modules/members/use-case/create-new-member/create-new-member.service"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { createLogger } from "src/shared/lib/logger/logger"
import { CreateMemberSchema, type CreateMemberSchemaOutput } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "create"])

type CreatedMemberResponse = {
	readonly id: number
}

export const POST = withAuth<CreatedMemberResponse | ResponseBodyError>(async function POST(
	request: NextRequest
): Promise<NextResponse<CreatedMemberResponse | ResponseBodyError>> {
	// 1. Parse JSON body.
	const parseBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseBodyResult.isErr()) {
		const responseBodyError: ResponseBodyError = { error_message: "Invalid request body" }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 2. Structural validation (types, enums, formats) via Valibot.
	const rawReqBody = parseBodyResult.value
	const parsed = safeParse(CreateMemberSchema, rawReqBody)
	if (!parsed.success) {
		const issue = parsed.issues[0]
		const message = issue?.message ?? "Validation failed"
		const responseBodyError: ResponseBodyError = { error_message: message }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 3. Hand the validated DTO to the use case.
	const service = container.resolve<CreateNewMemberService>(REGISTER_KEY.CREATE_NEW_MEMBER_SERVICE)
	const createMemberReq = toServiceRequest(parsed.output)
	const result = await service.execute(createMemberReq)
	if (result.isErr()) {
		return mapError(result.error)
	}

	const createdMemberResponse: CreatedMemberResponse = { id: result.value }
	return NextResponse.json(createdMemberResponse, { status: 201 })
})

function toServiceRequest(o: CreateMemberSchemaOutput): CreateMemberRequest {
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

/** Map a CreateMemberError to its HTTP status + body. */
function mapError(error: MemberValidationError | MemberConflictError | CryptoError | DatabaseError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberValidationError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 400 })
	}
	if (error instanceof MemberConflictError) {
		// Both conflict reasons (DUPLICATE_ID_CARD, POSITION_OCCUPIED) map to 409.
		// The error.message is specific enough for the client; no need to branch on reason here.
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 409 })
	}
	// CryptoError and DatabaseError are infra failures → 500, no leaky details.
	logger.error("members/create failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
