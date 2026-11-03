import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"

import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { withOriginGate } from "src/app/api/middleware/origin-gate"
import { envConfig } from "src/shared/config/env"

export const dynamic = "force-dynamic"

// SEC-2 (spec #124): logout is a state-changing public route — foreign
// Origin/Referer requests are blocked before the session is touched. No write
// budget: logging out is idempotent and cookie-clearing is harmless.
export const POST = withOriginGate(logout)

async function logout(request: NextRequest) {
	const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
	const sessionId = request.cookies.get("session_id")?.value

	if (!sessionId) {
		return NextResponse.json(null, { status: 401 })
	}

	authService.logout(sessionId)

	const response = new NextResponse(null, { status: 204 })

	// Clear session cookie
	response.cookies.set("session_id", "", {
		httpOnly: true,
		secure: envConfig.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	})

	response.headers.set("Cache-Control", "no-store")

	return response
}
