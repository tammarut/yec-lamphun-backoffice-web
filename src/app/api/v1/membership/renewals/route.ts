import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import {
	MemberNotFoundError,
	PendingRenewalExistsError,
	ResignedMemberError,
	type CreateRenewalError,
} from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.errors"
import { CreateRenewalService } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.service"
import type { CreateRenewalRequest } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { CreateRenewalSchema } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership-renewals", "route", "create"])

type CreatedRenewalResponse = {
	readonly id: number
}

// ============================================================================
// POST /api/v1/membership/renewals — create a new renewal request.
// Staff-only (withAuth), overriding the spec's `security: []` (grilling Q7 —
// every write route in this codebase is withAuth; the spec's empty security is
// treated as a copy-paste artifact, contradicted by its own session_id cookie).
//
// Flow:
//   1. Parse + structurally validate the JSON body (member_id, payment_slip).
//   2. Hand the DTO to the use case, which runs the status pre-check (404/403/409)
//      then the atomic cross-table write (INSERT renewal + UPDATE member cache
//      columns, ADR-0014).
// Success → 201 { id }. Errors → { error_message } with the matching status.
// ============================================================================
export const POST = withAuth<CreatedRenewalResponse | ResponseBodyError>(async function POST(
	request: NextRequest
): Promise<NextResponse<CreatedRenewalResponse | ResponseBodyError>> {
	// 1. Parse JSON body.
	const parseBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseBodyResult.isErr()) {
		const responseBodyError: ResponseBodyError = { error_message: "Invalid request body" }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 2. Structural validation (types, positive integer, non-empty string) via Valibot.
	const parsed = safeParse(CreateRenewalSchema, parseBodyResult.value)
	if (!parsed.success) {
		const issue = parsed.issues[0]
		const message = issue?.message ?? "Validation failed"
		const responseBodyError: ResponseBodyError = { error_message: message }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 3. Hand the validated DTO to the use case.
	const service = container.resolve<CreateRenewalService>(REGISTER_KEY.CREATE_RENEWAL_SERVICE)
	const createRenewalReq: CreateRenewalRequest = {
		memberId: parsed.output.member_id,
		paymentSlip: parsed.output.payment_slip,
	}
	const result = await service.execute(createRenewalReq)
	if (result.isErr()) {
		return mapError(result.error)
	}

	const createdRenewalResponse: CreatedRenewalResponse = { id: result.value }
	return NextResponse.json(createdRenewalResponse, { status: 201 })
})

/**
 * Map a CreateRenewalError to its HTTP status + body. Each branch is a distinct
 * status, branched by instanceof — matching the create-member route convention.
 * DatabaseError (infra, including the 23505 catch's non-23505 siblings) → 500,
 * no leaky details in the body.
 */
function mapError(error: CreateRenewalError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	if (error instanceof ResignedMemberError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 403 })
	}
	if (error instanceof PendingRenewalExistsError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 409 })
	}
	// DatabaseError (infra) → 500, no leaky details.
	logger.error("membership-renewals/create failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
