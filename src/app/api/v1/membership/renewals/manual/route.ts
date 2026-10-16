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
	type CreateManualRenewalError,
} from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.errors"
import { CreateManualRenewalService } from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.service"
import type { CreateManualRenewalRequest } from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { CreateManualRenewalSchema } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership-renewals", "route", "create-manual"])

type CreatedRenewalRowResponse = {
	readonly member_id: number
	readonly renewal_id: number
}

type CreatedRenewalResponse = {
	readonly renewals: ReadonlyArray<CreatedRenewalRowResponse>
	/** Shared Renewal Group marker (ADR-0026); null on a solo submission. */
	readonly group_id: string | null
}

// ============================================================================
// POST /api/v1/membership/renewals/manual — staff-only manual renewal create.
//
// PROTECTED (ADR-0016) — wrapped in withAuth: a missing or invalid session_id
// cookie returns 401 { error_message: "Unauthorized" } BEFORE the handler runs.
// This is the key difference from the public POST /api/v1/membership/renewals,
// where the cookie is optional (public-with-admin-bypass, ADR-0015). A manual
// submission is always an Admin Submission, so there is no submission-kind
// fork here and no isAdmin flag on the DTO — withAuth already proved staff.
//
// Since #85 the body is the SAME bulk contract as the public route
// (ADR-0026): member_ids[1..6] — one renewal row per member, all sharing the
// slip, ONE server-stamped payment date and (at N>1) ONE minted Renewal Group
// marker; every member's membership clock advances in the same transaction.
//
// Flow:
//   1. Parse + structurally validate the JSON body (member_ids, payment_slip).
//   2. Hand the DTO to the use case, which runs the SAME batched status
//      pre-check as the public flow (404/403/409 naming the member) then the
//      manual atomic write (INSERT renewal + UPDATE the four member cache
//      columns per member, including expires_at and renewal_successful_count,
//      ADR-0016).
// Success → 201 { renewals, group_id }. Errors → { error_message } with the
// matching status.
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
	const parsed = safeParse(CreateManualRenewalSchema, parseBodyResult.value)
	if (!parsed.success) {
		const issue = parsed.issues[0]
		const message = issue?.message ?? "Validation failed"
		const responseBodyError: ResponseBodyError = { error_message: message }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 3. Hand the validated DTO to the use case. No isAdmin flag: a manual
	//    submission is always an Admin Submission (withAuth proved staff); the
	//    service fixes the APPROVED/ACTIVE pair via MembershipRenewal.createManual.
	const service = container.resolve<CreateManualRenewalService>(REGISTER_KEY.CREATE_MANUAL_RENEWAL_SERVICE)
	const createManualRenewalReq: CreateManualRenewalRequest = {
		memberIds: parsed.output.member_ids,
		paymentSlip: parsed.output.payment_slip,
	}
	const result = await service.execute(createManualRenewalReq)
	if (result.isErr()) {
		return mapError(result.error)
	}

	// 4. Relay the per-member outcome in the shared snake_case contract: one
	//    (member_id, renewal_id) pair per member, in request order, plus the
	//    group marker (null on a solo submission).
	const createdRenewalResponse: CreatedRenewalResponse = {
		renewals: result.value.renewals.map((renewal) => ({
			member_id: renewal.memberId,
			renewal_id: renewal.renewalId,
		})),
		group_id: result.value.groupId,
	}
	return NextResponse.json(createdRenewalResponse, { status: 201 })
})

/**
 * Map a CreateManualRenewalError to its HTTP status + body. Identical status
 * mapping to the public create-renewal route (the domain outcomes are the same
 * 404/403/409/500 set); branched by instanceof matching that convention.
 * DatabaseError (infra) → 500, no leaky details in the body.
 */
function mapError(error: CreateManualRenewalError): NextResponse<ResponseBodyError> {
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
	logger.error("membership-renewals/create-manual failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
