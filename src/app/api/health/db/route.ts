import "reflect-metadata"
import { NextRequest, NextResponse } from "next/server"
import { container, REGISTER_KEY } from "src/modules/container"
import { HealthService } from "src/modules/health/health.service"

// This ensures the container is initialized (e.g. env vars loaded)
import "src/shared/config/env"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
	try {
		const healthService = container.resolve<HealthService>(
			REGISTER_KEY.HEALTH_SERVICE,
		)
		const result = await healthService.checkHealth()
		return NextResponse.json(result)
	} catch (error) {
		console.error("Health check failed:", error)
		return NextResponse.json(
			{ status: "error", message: "Health check failed" },
			{ status: 500 },
		)
	}
}
