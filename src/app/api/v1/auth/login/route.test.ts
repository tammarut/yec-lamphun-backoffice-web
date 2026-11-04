import { NextRequest } from "next/server"
import { describe, expect, test, vi } from "vitest"
import { ResponseBodyError } from "src/app/api/shared/types"
import { POST } from "./route"

// Mock the env configuration
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_USERNAME: "admin",
		ADMIN_PASSWORD: "Energetic9-Mulch2-Arknight6",
	},
}))

describe("POST /api/v1/auth/login", () => {
	test("should return 204 and set cookie on successful login", async () => {
		const body = JSON.stringify({
			username: "admin",
			password: "Energetic9-Mulch2-Arknight6",
		})
		const req = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: body,
		})

		const res = await POST(req)
		expect(res.status).toBe(204)

		const setCookie = res.headers.get("set-cookie")
		expect(setCookie).toBeDefined()
		expect(setCookie).toContain("session_id=")
		expect(setCookie).toContain("HttpOnly")
		expect(setCookie).toContain("Max-Age=86400") // 24 hours in seconds
	})

	test("should return 204 and set cookie with 30-day Max-Age on successful login with rememberMe", async () => {
		const body = JSON.stringify({
			username: "admin",
			password: "Energetic9-Mulch2-Arknight6",
			rememberMe: true,
		})
		const req = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: body,
		})

		const res = await POST(req)
		expect(res.status).toBe(204)

		const setCookie = res.headers.get("set-cookie")
		expect(setCookie).toBeDefined()
		expect(setCookie).toContain("session_id=")
		expect(setCookie).toContain("HttpOnly")
		expect(setCookie).toContain("Max-Age=2592000") // 30 days in seconds
	})

	test("should return 401 on invalid password", async () => {
		const body = JSON.stringify({
			username: "admin",
			password: "wrong-password",
		})
		const req = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: body,
		})

		const res = await POST(req)
		expect(res.status).toBe(401)
		const json = await res.json()
		expect(json).toEqual({
			error_message: "Invalid credentials",
		})
	})

	test("should return 400 on invalid body", async () => {
		const body = JSON.stringify({
			username: "admin",
			// missing password
		})
		const req = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: body,
		})

		const res = await POST(req)
		expect(res.status).toBe(400)
		const json = (await res.json()) as ResponseBodyError
		expect(json.error_message).toContain("password")
	})

	test("should return 403 when the Origin header is present but not allow-listed (SEC-2)", async () => {
		const body = JSON.stringify({
			username: "admin",
			password: "Energetic9-Mulch2-Arknight6",
		})
		const req = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: body,
			headers: { origin: "https://evil.example.net" },
		})

		const res = await POST(req)
		expect(res.status).toBe(403)
		const json = await res.json()
		expect(json).toEqual({ error_message: "Forbidden" })
	})

	// SEC-3 (#127): 5 failed logins within the window lock the IP+username pair.
	// The route-level test uses a username unique to this file so the real
	// container's singleton lockout map cannot leak streaks into sibling tests.
	test("should return 429 with Retry-After after 5 failed attempts for the same pair — even with the correct password (SEC-3)", async () => {
		// Act: five wrong-password attempts — each still a normal 401.
		for (let i = 0; i < 5; i += 1) {
			const body = JSON.stringify({
				username: "admin-locked",
				password: "wrong-password",
			})
			const req = new NextRequest("http://localhost/api/v1/auth/login", {
				method: "POST",
				body: body,
			})
			const res = await POST(req)
			expect(res.status).toBe(401)
		}

		// The sixth attempt — even carrying the correct ADMIN_PASSWORD — is
		// rejected by the lockout gate BEFORE the credential compare.
		const lockedBody = JSON.stringify({
			username: "admin-locked",
			password: "Energetic9-Mulch2-Arknight6",
		})
		const lockedReq = new NextRequest("http://localhost/api/v1/auth/login", {
			method: "POST",
			body: lockedBody,
		})
		const lockedRes = await POST(lockedReq)

		// Assert: the canonical 429 contract with Retry-After.
		expect(lockedRes.status).toBe(429)
		const json = await lockedRes.json()
		expect(json).toEqual({ error_message: "Too Many Requests" })
		const retryAfter = lockedRes.headers.get("retry-after")
		expect(retryAfter).not.toBeNull()
		expect(Number(retryAfter)).toBeGreaterThan(0)
	})
})
