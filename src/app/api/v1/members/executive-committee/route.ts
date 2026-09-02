import { NextResponse } from "next/server"
import "reflect-metadata"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetExecutiveCommitteeService } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.service"
import type { GetExecutiveCommitteeResponse } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"
import { createLogger } from "src/shared/lib/logger/logger"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "executive-committee"])

// ============================================================================
// GET /api/v1/members/executive-committee — the Executive Committee org-chart
// tree: every live, non-RESIGNED member holding any position except
// GENERAL_MEMBER, nested from the position hierarchy with the PRESIDENT holder
// at the root. Unheld rungs with live descendants render as Vacant Position
// placeholder nodes (id: null). No live PRESIDENT holder → body null.
// Spec: openapi-spec/get_member_executive_committee.openapi.json (ADR-0020
// supersedes the spec's stale parent_id pseudocode).
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation,
// taken literally like every sibling GET (members list, dashboard stat, etc.).
// The data class (names, avatars, position titles, business names) is the same
// already exposed by the public members list.
//
// No query parameters. The two static reads live in the members repository
// (sqlc, ADR-0010); the only failure mode is infra: DatabaseError → 500
// `{ error_message: "Internal Server Error" }` (no leaky details).
// ============================================================================
export async function GET(): Promise<NextResponse<GetExecutiveCommitteeResponse | ResponseBodyError>> {
	const service = container.resolve<GetExecutiveCommitteeService>(REGISTER_KEY.GET_EXECUTIVE_COMMITTEE_SERVICE)
	const result = await service.execute()
	if (result.isErr()) {
		logger.error("members/executive-committee failed: {errorMessage} (code={code})", {
			code: result.error.code,
			errorMessage: result.error.message,
			cause: result.error.cause,
		})

		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	return NextResponse.json(result.value)
}
