import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { integer, minValue, pipe, safeParse, string, transform } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { RenewalAlreadyReviewedError, RenewalNotFoundError, type ReviewRenewalError } from "src/modules/membership-renewals/use-case/review-renewal/review-renewal.errors"
import { ReviewRenewalService } from "src/modules/membership-renewals/use-case/review-renewal/review-renewal.service"
import type { ReviewRenewalRequest } from "src/modules/membership-renewals/use-case/review-renewal/review-renewal.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { ReviewRenewalSchema } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership-renewals", "route", "review"])

// Next 16: dynamic route params are a Promise. Await before reading renewal_id.
type ReviewRouteContext = { params: Promise<{ renewal_id: string }> }

// Inline renewal_id validation: parse the string path param into an integer > 0
// (mirrors renewals/[member_id]'s MemberIdParamSchema). NaN fails integer(),
// so non-numeric ids are rejected here. One field doesn't earn a schema file.
const RenewalIdParamSchema = pipe(
	string(),
	transform((v) => Number(v)),
	integer(),
	minValue(1)
)

// ============================================================================
// PATCH /api/v1/membership/renewals/{renewal_id}/review — staff decide a live
// pending renewal (ADR-0018).
//
// PROTECTED — wrapped in withAuth (the spec's session_id cookie is required):
// a missing or invalid session returns 401 { error_message: "Unauthorized" }
// BEFORE the handler runs, same contract as the manual create route.
//
// Flow:
//   1. Validate the renewal_id path param (positive integer) → else 400
//      { error_message: "invalid renewal_id" } (spec's literal string).
//   2. Parse + validate the JSON body. The schema owns BOTH the structural
//      rules (status enum) and the spec's cross-field pairing (REJECTED needs
//      a non-empty reason, APPROVED forbids one) → 400 "status and reason are
//      incorrect" on the pairing violation.
//   3. Hand the DTO to the use case: pre-check read (404 / clean 409), the
//      domain's review() transition, then the guarded cross-table write (the
//      racy 409 twin fires there).
// Success → 204 No Content (empty body). Errors → { error_message }.
// ============================================================================
export const PATCH = withAuth<ResponseBodyError>(async function PATCH(request: NextRequest, context): Promise<NextResponse<ResponseBodyError>> {
	const ctx = context as ReviewRouteContext
	const { renewal_id: rawId } = await ctx.params

	// 1. Path param: positive integer, else the spec's literal 400 message.
	const parsedId = safeParse(RenewalIdParamSchema, rawId)
	if (!parsedId.success) {
		return NextResponse.json({ error_message: "invalid renewal_id" } satisfies ResponseBodyError, { status: 400 })
	}

	// 2. Parse the JSON body.
	const parseBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseBodyResult.isErr()) {
		const responseBodyError: ResponseBodyError = { error_message: "Invalid request body" }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 3. Structural + cross-field validation (types, enum, status/reason
	//    pairing — all pure functions of the body, owned by the schema).
	const parsed = safeParse(ReviewRenewalSchema, parseBodyResult.value)
	if (!parsed.success) {
		const issue = parsed.issues[0]
		const message = issue?.message ?? "Validation failed"
		const responseBodyError: ResponseBodyError = { error_message: message }
		return NextResponse.json(responseBodyError, { status: 400 })
	}

	// 4. Hand the validated DTO to the use case. The transition rule and the
	//    member-side effects live behind it (domain + repository, ADR-0018).
	const service = container.resolve<ReviewRenewalService>(REGISTER_KEY.REVIEW_RENEWAL_SERVICE)
	const reviewRenewalReq: ReviewRenewalRequest = {
		renewalId: parsedId.output,
		decision: parsed.output.status,
		reason: parsed.output.reason ?? null,
	}
	const result = await service.execute(reviewRenewalReq)
	if (result.isErr()) {
		return mapError(result.error)
	}

	// 5. 204 No Content — success with no response body, per spec.
	return new NextResponse(null, { status: 204 })
})

/**
 * Map a ReviewRenewalError to its HTTP status + body. Not-found → 404 with the
 * spec's literal message; already-reviewed (whether detected by the pre-check
 * or by the guarded UPDATE under a race) → 409 with the spec's literal message;
 * DatabaseError (infra) → 500, no leaky details in the body.
 */
function mapError(error: ReviewRenewalError): NextResponse<ResponseBodyError> {
	if (error instanceof RenewalNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	if (error instanceof RenewalAlreadyReviewedError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 409 })
	}
	// DatabaseError (infra) → 500, no leaky details.
	logger.error("membership-renewals/review failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
