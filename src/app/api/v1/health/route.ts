import { NextResponse } from "next/server"

/**
 * GET /api/v1/health
 *
 * Health check endpoint for infrastructure monitoring (load balancers, k8s probes, etc.).
 * Returns 204 No Content on success.
 *
 * Deliberately NOT behind withPublicGuard (SEC-1 scrutiny, PR #132): a 429 here
 * would make LBs/k8s pull the healthy container — probes must never be throttled,
 * and the endpoint exposes nothing worth protecting.
 */
export async function GET(): Promise<NextResponse> {
	return new NextResponse(null, { status: 204 })
}
