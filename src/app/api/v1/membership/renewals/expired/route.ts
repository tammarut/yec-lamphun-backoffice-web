import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { InvalidCursorError, type GetListExpiredMembershipError } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.errors"
import { GetListExpiredMembershipService } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.service"
import type {
	ListExpiredMembershipFilter,
	ListExpiredMembershipPageResponse,
} from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { GetListExpiredMembershipQuerySchema } from "./list-schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership", "route", "list-expired"])

// ============================================================================
// GET /api/v1/membership/renewals/expired — the Expired Membership List for the
// backoffice renewal-review table (infinite scroll).
// Spec: openapi-spec/get_list_expired_membership.openapi.json.
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation
// (grilling Q1: taken literally, mirroring GET /members). Note it does return
// member PII (names, phone_no) — that is an accepted exposure for this
// endpoint, same as GET /members.
//
// Pagination: group-aware keyset variant of ADR-0011 (rejected-renewal group
// first, id ASC within each group; cursor = bare member id with an anchor
// latest_renewal_status lookup). Query idiom: Bun SQL native (dynamic read) —
// ADR-0010. The use case lives in the membership-renewals module (grilling Q5)
// even though the query reads only the members table.
// ============================================================================

export async function GET(request: NextRequest): Promise<NextResponse<ListExpiredMembershipPageResponse | ResponseBodyError>> {
	// 1. Read query string into a plain object for Valibot.
	const searchParams = request.nextUrl.searchParams
	const rawQuery: Record<string, string | undefined> = {
		limit: searchParams.get("limit") ?? undefined,
		cursor: searchParams.get("cursor") ?? undefined,
		search: searchParams.get("search") ?? undefined,
	}

	// 2. Structural validation (types, ranges) via Valibot.
	//    `safeParse` drops `undefined` entries against optional schemas cleanly.
	const parseResult = safeParse(GetListExpiredMembershipQuerySchema, rawQuery)
	if (!parseResult.success) {
		const issue = parseResult.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}
	const queryParam = parseResult.output

	// 3. Semantic post-processing the schema can't express: search trim + empty→null.
	const search = queryParam.search?.trim() || null

	// 4. Build the filter (defaults applied here, not in the schema).
	const filter: ListExpiredMembershipFilter = {
		limit: queryParam.limit ?? 10,
		cursor: queryParam.cursor ?? null,
		search: search,
	}

	// 5. Hand the filter to the use case.
	const service = container.resolve<GetListExpiredMembershipService>(REGISTER_KEY.GET_LIST_EXPIRED_MEMBERSHIP_SERVICE)
	const result = await service.execute(filter)
	if (result.isErr()) {
		return mapListError(result.error)
	}

	return NextResponse.json(result.value)
}

/** Map a GetListExpiredMembershipError to its HTTP status + body (GET-specific). */
function mapListError(error: GetListExpiredMembershipError): NextResponse<ResponseBodyError> {
	if (error instanceof InvalidCursorError) {
		// Deleted anchor — recoverable, client-visible. Warn, not error.
		logger.warn("membership/list-expired invalid cursor: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 400 })
	}
	// DatabaseError (infra) → 500, no leaky details.
	logger.error("membership/list-expired failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
