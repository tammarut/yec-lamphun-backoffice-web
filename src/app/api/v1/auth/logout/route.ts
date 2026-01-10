import { NextRequest, NextResponse } from "next/server"

import { AuthService } from "src/modules/auth"
import { envConfig } from "src/shared/config/env"
import { sessionCache } from "src/shared/lib/session-cache"

const authService = new AuthService(envConfig, sessionCache)

export async function POST(request: NextRequest) {
	const sessionId = request.cookies.get("session_id")?.value

	if (!sessionId) {
		return NextResponse.json(null, { status: 401 })
	}

	const logoutResult = authService.logout(sessionId)

	if (logoutResult.isErr()) {
		return NextResponse.json(null, { status: 401 })
	}

	const response = new NextResponse(null, { status: 204 })

	// Clear session cookie
	response.cookies.set("session_id", "", {
		httpOnly: true,
		secure: envConfig.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	})

	return response
}
