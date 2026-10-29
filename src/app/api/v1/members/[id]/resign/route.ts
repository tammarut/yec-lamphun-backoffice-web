import { NextResponse } from "next/server"
import "reflect-metadata"
import { integer, minValue, pipe, safeParse, string, transform } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError, MemberNotExpiredError, type ResignMemberError } from "src/modules/members/use-case/resign-member/resign-member.errors"
import { ResignMemberService } from "src/modules/members/use-case/resign-member/resign-member.service"
import { createLogger } from "src/shared/lib/logger/logger"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "resign"])

// Next 16: dynamic route params are a Promise. We await it before reading id.
type ResignRouteContext = { params: Promise<{ id: string }> }

// Inline id validation (the [id] route convention): parse the string path
// param into an integer > 0. No separate schema file — one integer field
// doesn't earn one. NaN fails the integer() check, so non-numeric ids are
// rejected here.
const IdParamSchema = pipe(
	string(),
	transform((v) => Number(v)),
	integer(),
	minValue(1)
)

// ============================================================================
// POST /api/v1/members/:id/resign — resign an EXPIRED member (#113).
//
// PROTECTED — wrapped in withAuth: a missing or invalid session_id cookie
// returns 401 { error_message: "Unauthorized" } BEFORE the handler runs.
// Single-admin house model: a valid session IS staff.
//
// A command subresource, deliberately NOT a PATCH field: resign is the one
// server-fixed transition EXPIRED → RESIGNED (admin close-out of the
// expired-members worklist); the member PATCH stays profile-edit-only and
// never exposes lifecycle columns. No request body. RESIGNED is terminal —
// there is deliberately no un-resign path.
//
// The transition is guarded TWICE inside the use case (status pre-check read,
// then an UPDATE whose own WHERE re-checks status = 'EXPIRED'), so the race
// loser is rejected with the same 409 as any other non-EXPIRED status.
// `status` is the only Renewal Cache Column touched; `updated_at` bumps.
//
// Success → 204 No Content (empty body). Errors → { error_message }:
//   400 invalid id · 401 no/invalid session · 404 missing or soft-deleted
//   · 409 status ≠ EXPIRED (incl. the race) · 500 database failure (logged).
// ============================================================================
export const POST = withAuth<ResponseBodyError>(async function POST(_request, context): Promise<NextResponse<ResponseBodyError>> {
	const ctx = context as ResignRouteContext
	const { id: rawId } = await ctx.params

	// 1. Validate the path-param id (same rule as GET/PATCH/DELETE).
	const idParsed = safeParse(IdParamSchema, rawId)
	if (!idParsed.success) {
		return NextResponse.json({ error_message: "id parameter must be a valid integer" } satisfies ResponseBodyError, { status: 400 })
	}

	// 2. Hand the id to the use case. No body to parse (a command subresource).
	const service = container.resolve<ResignMemberService>(REGISTER_KEY.MEMBER_RESIGN_SERVICE)
	const result = await service.execute(idParsed.output)
	if (result.isErr()) {
		return mapError(result.error)
	}

	// 3. 204 No Content — success with no body.
	return new NextResponse(null, { status: 204 })
})

/**
 * Map a ResignMemberError to its HTTP status + body. 404 and 409 relay the
 * domain messages verbatim (the reused MemberNotFoundError text and the one
 * MemberNotExpiredError message); DatabaseError (infra) → 500, no leaky
 * details.
 */
function mapError(error: ResignMemberError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	if (error instanceof MemberNotExpiredError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 409 })
	}
	logger.error("members/resign failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
