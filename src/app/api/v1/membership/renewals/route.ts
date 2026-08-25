import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { AuthService } from "src/modules/auth"
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
import { InvalidCursorError, type GetListMembershipRenewalError } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.errors"
import { GetListMembershipRenewalService } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.service"
import type {
	ListMembershipRenewalFilter,
	ListMembershipRenewalPageResponse,
} from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { CreateRenewalSchema } from "./schema"
import { GetListMembershipRenewalQuerySchema } from "./list-schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership-renewals", "route", "create"])
const listLogger = createLogger(["membership-renewals", "route", "list"])

type CreatedRenewalResponse = {
	readonly id: number
}

// ============================================================================
// POST /api/v1/membership/renewals — create a new renewal request.
//
// PUBLIC route (ADR-0015) — NOT wrapped in withAuth. The session_id cookie is
// OPTIONAL: it selects the submission kind via an inline soft check.
//   - no cookie / invalid cookie -> Public Submission -> PENDING_REVIEW / PENDING_RENEWAL
//   - valid cookie               -> Admin Submission -> APPROVED / ACTIVE (instant approval)
// This is the first non-withAuth write route whose behavior forks on the cookie
// (the file-upload route is public but cookie-agnostic). There is NO 401 path:
// a present-but-invalid cookie is treated identically to no cookie (invalid ≡
// absent). The soft check resolves AuthService from the container inline, the
// same way withAuth does, but never returns 401.
//
// Flow:
//   1. Parse + structurally validate the JSON body (member_id, payment_slip).
//   2. Resolve isAdmin (inline soft session check, no 401).
//   3. Hand the DTO to the use case, which runs the status pre-check (404/403/409)
//      then the atomic cross-table write (INSERT renewal + UPDATE member cache
//      columns, ADR-0014).
// Success → 201 { id }. Errors → { error_message } with the matching status.
// ============================================================================
export async function POST(request: NextRequest): Promise<NextResponse<CreatedRenewalResponse | ResponseBodyError>> {
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

	// 3. Resolve isAdmin via an inline soft session check (ADR-0015). The cookie is
	//    OPTIONAL: absent or invalid -> isAdmin=false (no 401); valid -> isAdmin=true.
	//    Mirrors withAuth's container.resolve(AuthService) call but never rejects.
	const sessionId = request.cookies.get("session_id")?.value
	let isAdmin = false
	if (sessionId) {
		const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
		const sessionResult = authService.validateSession(sessionId)
		isAdmin = sessionResult.isOk()
	}

	// 4. Hand the validated DTO to the use case. The service selects the status
	//    pair (PENDING_REVIEW/PENDING_RENEWAL vs APPROVED/ACTIVE) from isAdmin.
	const service = container.resolve<CreateRenewalService>(REGISTER_KEY.CREATE_RENEWAL_SERVICE)
	const createRenewalReq: CreateRenewalRequest = {
		memberId: parsed.output.member_id,
		paymentSlip: parsed.output.payment_slip,
		isAdmin,
	}
	const result = await service.execute(createRenewalReq)
	if (result.isErr()) {
		return mapError(result.error)
	}

	const createdRenewalResponse: CreatedRenewalResponse = { id: result.value }
	return NextResponse.json(createdRenewalResponse, { status: 201 })
}

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

// ============================================================================
// GET /api/v1/membership/renewals — the Membership Renewal List for the
// backoffice renewal-review table (infinite scroll), filtered to one Renewal
// Status tab (PENDING_REVIEW or APPROVED).
// Spec: openapi-spec/get_list_membership_renewal.openapi.json.
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation,
// taken literally like the sibling GET /membership/renewals/expired (grilling
// Q1). It returns member PII (names, phone_no) — the same accepted exposure as
// that endpoint and GET /members.
//
// Pagination: ADR-0011 keyset over (payment_date_at DESC, member id DESC) with
// a hardened anchor lookup (an anchor that left the requested status's set →
// 400 Invalid cursor — the post-935aced semantics). Query idiom: Bun SQL
// native (dynamic read) — ADR-0010.
//
// Spec deviations locked during grilling: `renewal_id` IS exposed (the
// pseudocode's transform includes it even though the formal schema omits it);
// `position` ships the raw position code, not the spec's POSITION_MAP Thai
// rendering; the error body is `{ error_message }` per the house contract (the
// pseudocode's `{ error }` shape contradicts the spec's own sequence diagram).
// ============================================================================
export async function GET(request: NextRequest): Promise<NextResponse<ListMembershipRenewalPageResponse | ResponseBodyError>> {
	// 1. Read query string into a plain object for Valibot.
	const searchParams = request.nextUrl.searchParams
	const rawQuery: Record<string, string | undefined> = {
		limit: searchParams.get("limit") ?? undefined,
		cursor: searchParams.get("cursor") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		search: searchParams.get("search") ?? undefined,
	}

	// 2. Structural validation (types, ranges, status enum) via Valibot.
	//    `safeParse` drops `undefined` entries against optional schemas cleanly.
	const parseResult = safeParse(GetListMembershipRenewalQuerySchema, rawQuery)
	if (!parseResult.success) {
		const issue = parseResult.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}
	const queryParam = parseResult.output

	// 3. Semantic post-processing the schema can't express: search trim + empty→null.
	const search = queryParam.search?.trim() || null

	// 4. Build the filter (defaults applied here, not in the schema).
	const filter: ListMembershipRenewalFilter = {
		limit: queryParam.limit ?? 10,
		cursor: queryParam.cursor ?? null,
		status: queryParam.status,
		search: search,
	}

	// 5. Hand the filter to the use case.
	const service = container.resolve<GetListMembershipRenewalService>(REGISTER_KEY.GET_LIST_MEMBERSHIP_RENEWAL_SERVICE)
	const result = await service.execute(filter)
	if (result.isErr()) {
		return mapListError(result.error)
	}

	return NextResponse.json(result.value)
}

/** Map a GetListMembershipRenewalError to its HTTP status + body (GET-specific). */
function mapListError(error: GetListMembershipRenewalError): NextResponse<ResponseBodyError> {
	if (error instanceof InvalidCursorError) {
		// Stale anchor — recoverable, client-visible. Warn, not error.
		listLogger.warn("membership-renewals/list invalid cursor: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
		return NextResponse.json({ error_message: error.message } satisfies ResponseBodyError, { status: 400 })
	}
	// DatabaseError (infra) → 500, no leaky details.
	listLogger.error("membership-renewals/list failed: {errorMessage} (code={code})", { code: error.code, errorMessage: error.message, cause: error.cause })
	return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
}
