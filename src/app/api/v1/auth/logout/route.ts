import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"

import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { envConfig } from "src/shared/config/env"

const authService = container.resolve(AuthService)

export async function POST(request: NextRequest) {
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

	return response
}
