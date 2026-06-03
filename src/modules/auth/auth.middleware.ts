import { NextRequest, NextResponse } from "next/server"
import { container } from "src/modules/container"
import { AuthService } from "./auth.service"
import type { SessionData } from "./types"

type RouteHandler = (request: NextRequest, session: SessionData) => Promise<NextResponse> | NextResponse

export function withAuth(handler: RouteHandler) {
	return async function authMiddleware(request: NextRequest): Promise<NextResponse> {
		const sessionId = request.cookies.get("session_id")?.value

		if (!sessionId) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		const authService = container.resolve(AuthService)
		const sessionResult = authService.validateSession(sessionId)

		if (sessionResult.isErr()) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		return handler(request, sessionResult.value)
	}
}
