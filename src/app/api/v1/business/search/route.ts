import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { BusinessSearchItem } from "src/modules/members/use-case/search-businesses/search-businesses.types"
import { SearchBusinessesService } from "src/modules/members/use-case/search-businesses/search-businesses.service"
import { createLogger } from "src/shared/lib/logger/logger"
import { BusinessSearchQuerySchema } from "./schema"

// ============================================================================
// GET /api/v1/business/search — live-business prefix search for the
// backoffice picker (#68). Staff-only (withAuth): the picker sits inside the
// member create/update wizards, which are staff-only.
//
// Delegates to SearchBusinessesService (escaped prefix-ILIKE over LIVE
// businesses + live-member rollup). The service's camelCase rows are mapped
// here to the snake_case wire DTO with the `businesses` wrapper key.
//
// Query params: `search` (trim + empty→null = no filter) and `limit`
// (1..50, default 10 — defaults applied in the route, not the schema).
// Errors: 401 (withAuth), 400 (validation), 500 (DatabaseError, no leaky
// details).
// ============================================================================

export const dynamic = "force-dynamic"

const logger = createLogger(["business", "search", "route"])

type BusinessSearchItemResponse = {
	readonly id: number
	readonly name: string
	readonly juristic_registration_no: string
	readonly category_name: string
	readonly address: string | null
	readonly member_count: number
	readonly owner_names: readonly string[]
}

export type BusinessSearchResponse = {
	readonly businesses: readonly BusinessSearchItemResponse[]
}

/** Map camelCase repository rows to the snake_case wire DTO (`businesses` wrapper key). */
function toBusinessSearchResponse(items: readonly BusinessSearchItem[]): BusinessSearchResponse {
	return {
		businesses: items.map((item) => ({
			id: item.id,
			name: item.name,
			juristic_registration_no: item.juristicRegistrationNo,
			category_name: item.categoryName,
			address: item.address,
			member_count: item.memberCount,
			owner_names: item.ownerNames,
		})),
	}
}

export const GET = withAuth<BusinessSearchResponse | ResponseBodyError>(async function GET(
	request: NextRequest
): Promise<NextResponse<BusinessSearchResponse | ResponseBodyError>> {
	// 1. Read query string into a plain object for Valibot.
	const rawQuery: Record<string, string | undefined> = {
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		limit: request.nextUrl.searchParams.get("limit") ?? undefined,
	}

	// 2. Structural validation (types, ranges) via Valibot.
	//    `safeParse` drops `undefined` entries against optional schemas cleanly.
	const parseResult = safeParse(BusinessSearchQuerySchema, rawQuery)
	if (!parseResult.success) {
		const issue = parseResult.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}
	const queryParam = parseResult.output

	// 3. Semantic post-processing the schema can't express: search trim +
	//    empty→null; limit default (applied here, not in the schema).
	const search = queryParam.search?.trim() || null
	const limit = queryParam.limit ?? 10

	// 4. Hand the filter to the use case.
	const service = container.resolve<SearchBusinessesService>(REGISTER_KEY.BUSINESS_SEARCH_SERVICE)
	const result = await service.execute({ limit, search })
	if (result.isErr()) {
		// DatabaseError (infra) → 500, no leaky details.
		logger.error("business/search failed: {errorMessage} (code={code})", { code: result.error.code, errorMessage: result.error.message, cause: result.error.cause })
		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	// 5. Map camelCase rows to the snake_case wire DTO.
	return NextResponse.json(toBusinessSearchResponse(result.value))
})
