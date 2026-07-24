import { err, ok, type Result, ResultAsync } from "neverthrow"
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
import { InvalidCursorError, type GetListMembersError } from "src/modules/members/use-case/get-list-members/get-list-members.errors"
import { GetListMembersService } from "src/modules/members/use-case/get-list-members/get-list-members.service"
import type { ListMembersFilter, ListMembersPageResponse, MemberStatus } from "src/modules/members/use-case/get-list-members/get-list-members.types"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { createLogger } from "src/shared/lib/logger/logger"
import { GetListMembersQuerySchema } from "./list-schema"
import { CreateMemberSchema, type CreateMemberSchemaOutput } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "create"])
const listLogger = createLogger(["members", "route", "list"])

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

// ============================================================================
// GET /api/v1/members — paginated, filtered, sorted list (infinite scroll).
// Spec: openapi-spec/get_list_members_pagination.openapi.json.
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation.
// Unlike POST /members and GET /members/:id (which are staff-only and
// withAuth-wrapped), this list endpoint is intentionally public. Note it does
// return member PII (names, phone_no, email, line_id) — that is an accepted
// exposure for this endpoint.
//
// Pagination: keyset on (sort_field, id) — see docs/adr/0011-... .
// Query idiom: Bun SQL native (dynamic read) — see docs/adr/0010-... .
// ============================================================================

export async function GET(request: NextRequest): Promise<NextResponse<ListMembersPageResponse | ResponseBodyError>> {
	// 1. Read query string into a plain object for Valibot.
	const searchParams = request.nextUrl.searchParams
	const rawQuery: Record<string, string | undefined> = {
		limit: searchParams.get("limit") ?? undefined,
		cursor: searchParams.get("cursor") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		sort_by: searchParams.get("sort_by") ?? undefined,
		sort_order: searchParams.get("sort_order") ?? undefined,
	}

	// 2. Structural validation (types, enums, ranges) via Valibot.
	//    `safeParse` drops `undefined` entries against optional schemas cleanly.
	const parseResult = safeParse(GetListMembersQuerySchema, rawQuery)
	if (!parseResult.success) {
		const issue = parseResult.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}
	const queryParam = parseResult.output

	// 3. Semantic post-processing the schema can't express:
	//    status CSV split + per-token enum check; search trim + empty→null.
	const statusesResult = parseStatusFilter(queryParam.status)
	if (statusesResult.isErr()) {
		return NextResponse.json({ error_message: statusesResult.error } satisfies ResponseBodyError, { status: 400 })
	}
	const search = queryParam.search?.trim() || null

	// 4. Build the filter (defaults applied here, not in the schema).
	const filter: ListMembersFilter = {
		limit: queryParam.limit ?? 10,
		cursor: queryParam.cursor ?? null,
		statuses: statusesResult.value,
		search: search,
		sortBy: queryParam.sort_by ?? "created_at",
		sortOrder: queryParam.sort_order ?? "desc",
	}

	// 5. Hand the filter to the use case.
	const service = container.resolve<GetListMembersService>(REGISTER_KEY.GET_LIST_MEMBERS_SERVICE)
	const result = await service.execute(filter)
	if (result.isErr()) {
		return mapListError(result.error)
	}

	return NextResponse.json(result.value)
}

/**
 * Parse the `status` query param per grilling Q2 / Q10-c.
 *
 * - Absent / empty / all-empty-tokens (`?status=,,`) → `null` (no filter).
 * - Otherwise each non-empty token must be a valid `MemberStatus`; any unknown
 *   token → `err("<message>")`, which the route maps to 400.
 *
 * Returns a `neverthrow` `Result` (AGENTS.md §2B) so the route's 400 path uses
 * `.isErr()` uniformly with every other check in the file.
 */
function parseStatusFilter(inputStatus: string | undefined): Result<readonly MemberStatus[] | null, string> {
	if (inputStatus === undefined) {
		return ok(null)
	}

	const tokens = inputStatus
		.split(",")
		.map((t) => t.trim())
		.filter((t) => t.length > 0)
	if (tokens.length === 0) {
		// `?status=` or `?status=,,` → no filter, not an error.
		return ok(null)
	}

	const memberStatuses: MemberStatus[] = []
	for (const t of tokens) {
		if (t !== "ACTIVE" && t !== "EXPIRED" && t !== "PENDING_RENEWAL" && t !== "RESIGNED") {
			return err(`Invalid status filter: ${t}`)
		}
		memberStatuses.push(t)
	}

	return ok(memberStatuses)
}

/** Map a GetListMembersError to its HTTP status + body (GET-specific). */
function mapListError(error: GetListMembersError): NextResponse<ResponseBodyError> {
	if (error instanceof InvalidCursorError) {
		// Deleted anchor (Q3b) — recoverable, client-visible. Warn, not error.
		listLogger.warn("members/list invalid cursor: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 400 })
	}
	// DatabaseError (infra) → 500, no leaky details.
	listLogger.error("members/list failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}

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
