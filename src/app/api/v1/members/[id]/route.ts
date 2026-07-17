import { integer, minValue, pipe, safeParse, string, transform } from "valibot"
import { NextResponse } from "next/server"
import "reflect-metadata"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import type { GetMemberByIdError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"

export const dynamic = "force-dynamic"

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
		return mapError(result.error)
	}

	return NextResponse.json(result.value)
})

/** Map a GetMemberByIdError to its HTTP status + body. */
function mapError(error: GetMemberByIdError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberNotFoundError) {
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 404 })
	}
	// DatabaseError (incl. missing-business corruption, Q6/iii-a) and StorageError
	// (presign failure — infra-level) → 500, no leaky details. CryptoError is never
	// propagated (swallowed to null in the service per ADR-0008), so it is not in
	// the GetMemberByIdError union.
	console.error(`[members/get-by-id] error: ${error.message}`, { code: error.code, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
