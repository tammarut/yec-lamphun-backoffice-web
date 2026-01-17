import "reflect-metadata"

import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { safeParse } from "valibot"

import { AuthService, LoginRequestSchema } from "src/modules/auth"
import { container } from "src/modules/container"
import { envConfig } from "src/shared/config/env"

const authService = container.resolve(AuthService)

export async function POST(request: NextRequest) {
	const parseReqBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseReqBodyResult.isErr()) {
		return NextResponse.json({ error_message: "Invalid request body" }, { status: 400 })
	}

	const reqBody = parseReqBodyResult.value
	const validateReqBodyResult = safeParse(LoginRequestSchema, reqBody)

	if (!validateReqBodyResult.success) {
		return NextResponse.json({ error_message: "Invalid request body" }, { status: 400 })
	}

	const { username, password } = validateReqBodyResult.output

	// Use auth service for business logic
	const loginResult = authService.login(username, password)

	if (loginResult.isErr()) {
		return NextResponse.json({ error_message: loginResult.error.message }, { status: 401 })
	}

	const response = new NextResponse(null, { status: 204 })

	// Set-Cookie
	response.cookies.set("session_id", loginResult.value, {
		httpOnly: true,
		secure: envConfig.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24, // 1 day
	})

	response.headers.set("Cache-Control", "no-store")
	response.headers.set("X-Content-Type-Options", "nosniff")

	return response
}
