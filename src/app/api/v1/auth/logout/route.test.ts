import { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { AuthService } from "src/modules/auth"

// Mock env config BEFORE importing the route
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_PASSWORD: "test-password",
	},
}))

// Use vi.hoisted to ensure the mock variable is initialized.
// We cannot use mock<AuthService>() inside vi.hoisted because the import 'mock'
// is not available inside the hoisted block (hoisted block runs before imports).
// So we define the shape manually or use a simpler mock for the hoisted variable,
// and then type assertion if needed.
const { mockAuthService } = vi.hoisted(() => {
	return {
		mockAuthService: {
			logout: vi.fn(),
			login: vi.fn(),
		},
	}
})

// Mock container BEFORE importing the route
vi.mock("src/modules/container", () => {
	return {
		container: {
			resolve: vi.fn(() => mockAuthService),
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
	})
})
