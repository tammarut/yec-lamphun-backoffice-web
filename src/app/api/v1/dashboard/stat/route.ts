import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { safeParse } from "valibot"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetDashboardStatService } from "src/modules/dashboard/use-case/get-dashboard-stat/get-dashboard-stat.service"
import type { DashboardStatResponse } from "src/modules/dashboard/use-case/get-dashboard-stat/get-dashboard-stat.types"
import { createLogger } from "src/shared/lib/logger/logger"
import { GetDashboardStatQuerySchema } from "./schema"

export const dynamic = "force-dynamic"

const logger = createLogger(["dashboard", "route", "stat"])

// ============================================================================
// GET /api/v1/dashboard/stat — the Dashboard Stat: the five headline counts
// of the backoffice dashboard (spec's UI mock: totals cards + a per-year
// members chart).
// Spec: openapi-spec/get_total_count_dashboard.openapi.json.
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation,
// taken literally like every sibling GET (renewals list, expired list, and
// the renewal stat). The response is bare aggregate counts — no member PII
// is exposed.
//
// One optional query parameter, `lookback_years` (1..20, default 5 — applied
// here in the route, not the schema). The three aggregate queries live in
// the dashboard repository (sqlc static reads, ADR-0010/ADR-0019); the only
// failure mode is infra: DatabaseError → 500
// `{ error_message: "Internal Server Error" }` (no leaky details).
// ============================================================================
export async function GET(request: NextRequest): Promise<NextResponse<DashboardStatResponse | ResponseBodyError>> {
	// 1. Read query string into a plain object for Valibot.
	const searchParams = request.nextUrl.searchParams
	const rawQuery: Record<string, string | undefined> = {
		lookback_years: searchParams.get("lookback_years") ?? undefined,
	}

	// 2. Structural validation (integer, 1..20) via Valibot. `safeParse`
	//    drops the `undefined` entry against the optional schema cleanly.
	const parseResult = safeParse(GetDashboardStatQuerySchema, rawQuery)
	if (!parseResult.success) {
		const issue = parseResult.issues[0]
		const message = issue?.message ?? "Validation failed"
		return NextResponse.json({ error_message: message } satisfies ResponseBodyError, { status: 400 })
	}

	// 3. Apply the default (absent → 5) and hand off to the use case.
	const lookbackYears = parseResult.output.lookback_years ?? 5

	const service = container.resolve<GetDashboardStatService>(REGISTER_KEY.GET_DASHBOARD_STAT_SERVICE)
	const result = await service.execute(lookbackYears)
	if (result.isErr()) {
		logger.error("dashboard/stat failed: {errorMessage} (code={code})", {
			code: result.error.code,
			errorMessage: result.error.message,
			cause: result.error.cause,
		})

		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	return NextResponse.json(result.value)
}
