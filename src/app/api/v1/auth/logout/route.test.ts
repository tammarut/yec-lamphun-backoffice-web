import { describe, expect, test, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock env config BEFORE importing the route
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_PASSWORD: "test-password",
	},
}))

// Mock session cache
const mockSessionDelete = vi.fn()
const mockSessionCreate = vi.fn()

vi.mock("src/shared/lib/session-cache", () => {
	return {
		sessionCache: {
			delete: (sessionId: string) => mockSessionDelete(sessionId),
			createSession: (data: any) => mockSessionCreate(data),
		},
	}
})

// Import route AFTER mocks
import { POST } from "./route"

describe("POST /api/v1/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Happy cases", () => {
		test("should return 204 and clear cookie on successful logout", async () => {
			const sessionId = "valid-session-id"
			mockSessionDelete.mockReturnValue(true)

			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})
			request.cookies.set("session_id", sessionId)

			const response = await POST(request)

			expect(response.status).toBe(204)
			expect(mockSessionDelete).toHaveBeenCalledWith(sessionId)

			// Check if cookie is cleared (maxAge: 0)
			const setCookieHeader = response.headers.get("set-cookie")
			expect(setCookieHeader).toBeDefined()
			expect(setCookieHeader).toContain("session_id=;")
			expect(setCookieHeader).toContain("Max-Age=0")
		})

		test("should return 204 when session is invalid/not found (idempotent)", async () => {
			const sessionId = "invalid-session-id"
			mockSessionDelete.mockReturnValue(false)

			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})
			request.cookies.set("session_id", sessionId)

			const response = await POST(request)

			expect(response.status).toBe(204)
			expect(mockSessionDelete).toHaveBeenCalledWith(sessionId)
		})
	})

	describe("Unhappy cases", () => {
		test("should return 401 when session_id cookie is missing", async () => {
			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})

			const response = await POST(request)

			expect(response.status).toBe(401)
			expect(mockSessionDelete).not.toHaveBeenCalled()
		})
	})
})
