import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { ulid } from "ulid"
import { safeParse } from "valibot"

import { LoginRequestSchema } from "src/modules/auth/validators"
import { sessionCache } from "src/shared/lib/session-store"

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
	const adminPassword = process.env["ADMIN_PASSWORD"]

	if (username !== "admin" || !adminPassword || password !== adminPassword) {
		return NextResponse.json({ error_message: "Invalid credentials" }, { status: 401 })
	}

	// Create Session
	const sessionId = ulid()
	sessionCache.set(sessionId, { username })

	const response = new NextResponse(null, { status: 204 })

	// Set-Cookie
	response.cookies.set("session_id", sessionId, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 86400,
	})

	response.headers.set("Cache-Control", "no-store")
	response.headers.set("X-Content-Type-Options", "nosniff")

	return response
}
