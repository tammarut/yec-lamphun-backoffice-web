import { NextResponse } from "next/server"

import { withPublicGuard } from "src/app/api/middleware/with-public-guard"

/**
 * GET /api/v1/health
 *
 * Health check endpoint for infrastructure monitoring (load balancers, k8s probes, etc.).
 * Returns 204 No Content on success.
 */
async function probeHealth(): Promise<NextResponse> {
	return new NextResponse(null, { status: 204 })
}

export const GET = withPublicGuard("PUBLIC_READ", probeHealth)
