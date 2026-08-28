import { NextResponse } from "next/server"
import "reflect-metadata"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetRenewalStatService } from "src/modules/membership-renewals/use-case/get-renewal-stat/get-renewal-stat.service"
import type { RenewalStatResponse } from "src/modules/membership-renewals/use-case/get-renewal-stat/get-renewal-stat.types"
import { createLogger } from "src/shared/lib/logger/logger"

export const dynamic = "force-dynamic"

const logger = createLogger(["membership-renewals", "route", "stat"])

// ============================================================================
// GET /api/v1/membership/renewals/stat — the Renewal Stat: the three badge
// counts above the backoffice renewal-review table.
// Spec: openapi-spec/get_total_count_membership_renewal.openapi.json.
//
// PUBLIC (no withAuth) — the spec declares `security: []` on this operation,
// taken literally like both sibling GETs (/renewals and /renewals/expired).
// The response is three bare counts — no member PII is exposed.
//
// No query parameters → no Valibot schema file; the handler takes no request
// argument. The single aggregate query lives in the repository (sqlc static
// read, ADR-0010/ADR-0017); the only failure mode is infra: DatabaseError →
// 500 `{ error_message: "Internal Server Error" }` (no leaky details).
// ============================================================================
export async function GET(): Promise<NextResponse<RenewalStatResponse | ResponseBodyError>> {
	const service = container.resolve<GetRenewalStatService>(REGISTER_KEY.GET_RENEWAL_STAT_SERVICE)
	const result = await service.execute()
	if (result.isErr()) {
		logger.error("membership-renewals/stat failed: {errorMessage} (code={code})", {
			code: result.error.code,
			errorMessage: result.error.message,
			cause: result.error.cause,
		})

		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	return NextResponse.json(result.value)
}
