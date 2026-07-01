import "reflect-metadata"

import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import * as v from "valibot"

import { AuthService } from "src/modules/auth"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { container } from "src/modules/container"

export const dynamic = "force-dynamic"

const LoginRequestBodySchema = v.object({
	username: v.pipe(v.string("Username must be a string"), v.minLength(1, "Username is required"), v.maxLength(100, "Username cannot exceed 100 characters")),
	password: v.pipe(v.string("Password must be a string"), v.minLength(1, "Password is required"), v.maxLength(255, "Password cannot exceed 255 characters")),
	rememberMe: v.optional(v.boolean("rememberMe must be a boolean"), false),
})

export async function POST(request: NextRequest) {
	const parseReqBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseReqBodyResult.isErr()) {
		return NextResponse.json({ error_message: parseReqBodyResult.error.message }, { status: 400 })
	}

	const rawReqBody = parseReqBodyResult.value
	const validateReqBodyResult = v.safeParse(LoginRequestBodySchema, rawReqBody)
	if (!validateReqBodyResult.success) {
		return NextResponse.json({ error_message: validateReqBodyResult.issues[0].message }, { status: 400 })
	}

	const reqBody = validateReqBodyResult.output

	// Extract metadata
	const userAgent = request.headers.get("user-agent")
	const reqForwardedFor = request.headers.get("x-forwarded-for")
	const ip = reqForwardedFor?.split(",")[0] ?? null

	// Use auth service for business logic
	const authService = container.resolve<AuthService>(REGISTER_KEY.AUTH_SERVICE)
	const loginResult = authService.login({
		username: reqBody.username,
		password: reqBody.password,
		rememberMe: reqBody.rememberMe,
		ip: ip,
		userAgent: userAgent,
	})

	if (loginResult.isErr()) {
		const error = loginResult.error
		return NextResponse.json({ error_message: error.message }, { status: 401 })
	}

	const { sessionId, ttlSeconds } = loginResult.value

	const response = new NextResponse(null, { status: 204 })

	// Set-Cookie
	response.cookies.set("session_id", sessionId, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
		maxAge: ttlSeconds,
	})

	response.headers.set("Cache-Control", "no-store")
	response.headers.set("X-Content-Type-Options", "nosniff")

	return response
}
