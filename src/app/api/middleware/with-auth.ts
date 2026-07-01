import { NextRequest, NextResponse } from "next/server"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { container } from "src/modules/container"
import { AuthService } from "src/modules/auth"
import type { SessionData } from "src/modules/auth/types"

type RouteHandler = (request: NextRequest, context: unknown, session: SessionData) => Promise<NextResponse> | NextResponse

export function withAuth(handler: RouteHandler) {
	return async function authMiddleware(request: NextRequest, context: unknown): Promise<NextResponse> {
		const sessionId = request.cookies.get("session_id")?.value

		if (!sessionId) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
		const sessionResult = authService.validateSession(sessionId)

		if (sessionResult.isErr()) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		if (!sessionResult.value.username) {
			return NextResponse.json({ error_message: "Forbidden" }, { status: 403 })
		}

		return handler(request, context, sessionResult.value)
	}
}
