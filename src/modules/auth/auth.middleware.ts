import { NextRequest, NextResponse } from "next/server"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { ISessionStore } from "src/modules/auth/interfaces"
import type { SessionData } from "src/modules/auth/types"

type RouteHandler = (request: NextRequest, session: SessionData) => Promise<NextResponse> | NextResponse

export function withAuth(handler: RouteHandler) {
	return async function authMiddleware(request: NextRequest): Promise<NextResponse> {
		const sessionId = request.cookies.get("session_id")?.value

		if (!sessionId) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		const sessionStore = container.resolve<ISessionStore>(REGISTER_KEY.SESSION_STORE)
		const session = sessionStore.get(sessionId)

		if (!session) {
			return NextResponse.json({ error_message: "Unauthorized" }, { status: 401 })
		}

		return handler(request, session)
	}
}
