import { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { AuthService } from "src/modules/auth"
import { REGISTER_KEY } from "src/modules/di-tokens"

// Mock env config BEFORE importing the route
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_PASSWORD: "test-password",
	},
}))

// Create a spy that is hoisted so it can be used in the mock factory
const { resolveSpy } = vi.hoisted(() => {
	return { resolveSpy: vi.fn() }
})

vi.mock("src/modules/container", () => {
	return {
		container: {
			resolve: resolveSpy,
		},
	}
})

// Import route AFTER mocks
import { POST } from "./route"

describe("POST /api/v1/auth/logout", () => {
	const mockAuthService = mock<AuthService>()

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset the resolve spy: AuthService for its token, a plain env stub for
		// ENV_CONFIG (the SEC-2 origin gate resolves it per request — the old
		// blanket mockReturnValue leaked the service mock into the gate).
		resolveSpy.mockImplementation((token) => {
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return { NODE_ENV: "test", ORIGIN_ALLOW_LIST: "" }
			}
			return mockAuthService
		})
	})

	describe("Happy cases", () => {
		test("should return 204 and clear cookie on successful logout", async () => {
			const sessionId = "valid-session-id"

			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})
			request.cookies.set("session_id", sessionId)

			const response = await POST(request)

			expect(response.status).toBe(204)
			expect(mockAuthService.logout).toHaveBeenCalledWith(sessionId)

			// Check if cookie is cleared (maxAge: 0)
			const setCookieHeader = response.headers.get("set-cookie")
			expect(setCookieHeader).toBeDefined()
			expect(setCookieHeader).toContain("session_id=;")
			expect(setCookieHeader).toContain("Max-Age=0")
			expect(response.headers.get("Cache-Control")).toBe("no-store")
		})

		test("should return 204 when session is invalid/not found (idempotent)", async () => {
			const sessionId = "invalid-session-id"

			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})
			request.cookies.set("session_id", sessionId)

			const response = await POST(request)

			expect(response.status).toBe(204)
			expect(mockAuthService.logout).toHaveBeenCalledWith(sessionId)
			expect(response.headers.get("Cache-Control")).toBe("no-store")
		})
	})

	describe("Unhappy cases", () => {
		test("should return 401 when session_id cookie is missing", async () => {
			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
			})

			const response = await POST(request)

			expect(response.status).toBe(401)
			expect(mockAuthService.logout).not.toHaveBeenCalled()
		})

		test("should return 403 when the Origin header is present but not allow-listed (SEC-2)", async () => {
			const request = new NextRequest("http://localhost/api/v1/auth/logout", {
				method: "POST",
				headers: { origin: "https://evil.example.net" },
			})

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = await response.json()
			expect(json).toEqual({ error_message: "Forbidden" })
			expect(mockAuthService.logout).not.toHaveBeenCalled()
		})
	})
})
