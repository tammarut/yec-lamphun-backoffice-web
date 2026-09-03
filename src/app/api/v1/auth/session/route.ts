import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
	const sessionId = request.cookies.get("session_id")?.value

	if (!sessionId) {
		return NextResponse.json({ error_message: "Unauthorized" } satisfies ResponseBodyError, { status: 401 })
	}

	const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
	const sessionResult = authService.validateSession(sessionId)

	if (sessionResult.isErr()) {
		return NextResponse.json({ error_message: "Unauthorized" } satisfies ResponseBodyError, { status: 401 })
	}

	const response = new NextResponse<null>(null, { status: 204 })
	response.headers.set("Cache-Control", "no-store")
	return response
}
