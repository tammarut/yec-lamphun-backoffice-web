import { NextResponse } from "next/server"
import "reflect-metadata"
import { integer, minValue, pipe, safeParse, string, transform } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import {
	MemberOrRenewalNotFoundError,
	RenewalNotFoundError,
	type GetLatestRenewalByMemberIdError,
} from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.errors"
import { GetLatestRenewalByMemberIdService } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.service"
import type { LatestRenewalResponse } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.types"
import { createLogger } from "src/shared/lib/logger/logger"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership", "route", "get-latest-renewal"])

// Next 16: dynamic route params are a Promise. Await before reading member_id.
type RenewalRouteContext = { params: Promise<{ member_id: string }> }

// Inline member_id validation: parse the string path param into an integer > 0
// (mirrors members/[id]'s IdParamSchema). NaN fails integer(), so non-numeric
// ids are rejected here. One field doesn't earn a separate schema file.
const MemberIdParamSchema = pipe(
	string(),
	transform((v) => Number(v)),
	integer(),
	minValue(1)
)

// ============================================================================
// GET /api/v1/membership/renewals/:member_id — a member's latest renewal, for
// the backoffice single-view.
//
// Staff-only (withAuth). The spec marks this route `security: []`, but every
// GET in this backoffice is withAuth-protected and this returns member PII
// (names, phone, avatar) — the empty security is treated as a copy-paste
// artifact, same override documented on members/[id] (grilling Q2).
//
// Flow:
//   1. Validate the member_id path param (positive integer) → else 400.
//   2. Hand the id to the use case (member-centric read owned by the members
//      module). The service returns two distinct not-found errors (404) and
//      propagates infra failures (DatabaseError / presign StorageError → 500).
// Success → 200 {LatestRenewalResponse}. Errors → { error_message }.
// ============================================================================
export const GET = withAuth<LatestRenewalResponse | ResponseBodyError>(async function GET(_request, context): Promise<NextResponse<LatestRenewalResponse | ResponseBodyError>> {
	const ctx = context as RenewalRouteContext
	const { member_id: rawId } = await ctx.params

	const parsed = safeParse(MemberIdParamSchema, rawId)
	if (!parsed.success) {
		return NextResponse.json({ error_message: "member_id parameter must be a valid integer" } satisfies ResponseBodyError, { status: 400 })
	}

	const service = container.resolve<GetLatestRenewalByMemberIdService>(REGISTER_KEY.GET_LATEST_RENEWAL_BY_MEMBER_ID_SERVICE)
	const result = await service.execute(parsed.output)
	if (result.isErr()) {
		return mapError(result.error)
	}

	return NextResponse.json(result.value)
})

/**
 * Map a GetLatestRenewalByMemberIdError to its HTTP status + body. Both
 * not-found errors → 404 with their distinct messages; DatabaseError (query
 * failure) and StorageError (presign failure — infra-level) → 500 with no
 * leaky details in the body.
 */
function mapError(error: GetLatestRenewalByMemberIdError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberOrRenewalNotFoundError || error instanceof RenewalNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	logger.error("membership/get-latest-renewal failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
