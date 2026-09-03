import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"

import { ResponseBodyError } from "src/app/api/shared/types"
// Import route AFTER mocks
import { GET } from "./route"

const mockSessionData = {
	username: "admin",
	ip: "127.0.0.1",
	userAgent: "Mozilla/5.0",
	createdAt: new Date(),
	lastAccessedAt: new Date(),
	expiresAt: new Date(),
	isPersistent: false,
	ttlSeconds: 86400,
}

describe("GET /api/v1/auth/session", () => {
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockAuthService = mock<AuthService>()
		// Configure container to return correct mock based on requested token
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === AuthService || token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("should return 204 when session_id cookie is valid", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const request = new NextRequest("http://localhost/api/v1/auth/session")
			request.cookies.set("session_id", "valid-session")

			const response = await GET(request)

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(204)
			expect(mockAuthService.validateSession).toHaveBeenCalledWith("valid-session")
			expect(response.headers.get("Cache-Control")).toBe("no-store")
		})
	})

	describe("Unhappy cases", () => {
		it("should return 401 when session_id cookie is missing", async () => {
			const request = new NextRequest("http://localhost/api/v1/auth/session")
			// No cookie set

			const response = await GET(request)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockAuthService.validateSession).not.toHaveBeenCalled()
		})

		it("should return 401 when session is invalid", async () => {
			mockAuthService.validateSession.mockReturnValue(err(new Error("Session not found")))

			const request = new NextRequest("http://localhost/api/v1/auth/session")
			request.cookies.set("session_id", "invalid-session")

			const response = await GET(request)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})
	})
})
