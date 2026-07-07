import { NextRequest, NextResponse } from "next/server"
import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import type { SessionData } from "src/modules/auth/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"

type RouteHandler<T = unknown> = (request: NextRequest, context: unknown, session: SessionData) => Promise<NextResponse<T>> | NextResponse<T>

export function withAuth<T>(handler: RouteHandler<T>) {
	return async function authMiddleware(request: NextRequest, context: unknown): Promise<NextResponse<T | ResponseBodyError>> {
		const sessionId = request.cookies.get("session_id")?.value

		if (!sessionId) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
		const sessionResult = authService.validateSession(sessionId)

		if (sessionResult.isErr()) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		const sessionData = sessionResult.value
		return handler(request, context, sessionData)
	}
}
