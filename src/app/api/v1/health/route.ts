import { NextResponse } from "next/server"

/**
 * GET /api/v1/health
 *
 * Health check endpoint for infrastructure monitoring (load balancers, k8s probes, etc.).
 * Returns 204 No Content on success.
 */
export function GET(): NextResponse {
	return new NextResponse(null, { status: 204 })
}
