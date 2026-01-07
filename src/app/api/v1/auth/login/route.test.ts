import { NextRequest } from "next/server"
import { describe, expect, test, vi } from "vitest"
import { POST } from "./route"

// Mock the env configuration
vi.mock("src/shared/config/env", () => ({
	env: {
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
		expect(json.error_message).toBe("Invalid credentials")
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
		const json = await res.json()
		expect(json.error_message).toBe("Invalid request body")
	})
})
