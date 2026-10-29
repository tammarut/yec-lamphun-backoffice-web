// @vitest-environment node
import { err, ok } from "neverthrow"
import { NextRequest } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError, MemberNotExpiredError } from "src/modules/members/use-case/resign-member/resign-member.errors"
import { ResignMemberService } from "src/modules/members/use-case/resign-member/resign-member.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { POST } from "./route"

/**
 * POST is a withAuth-wrapped handler with the signature (request, context).
 * The context carries the dynamic `id` path param (Next 16: a Promise).
 */
function makeRequest(id: string, sessionCookie?: string): NextRequest {
	const req = new NextRequest(`http://localhost/api/v1/members/${id}/resign`, {
		method: "POST",
	})
	if (sessionCookie !== undefined) {
		req.cookies.set("session_id", sessionCookie)
	}
	return req
}

function makeContext(id: string) {
	return { params: Promise.resolve({ id: id }) }
}

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

describe("POST /api/v1/members/:id/resign", () => {
	let mockService: ReturnType<typeof mock<ResignMemberService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		// Arrange (shared setup): staff path defaults — a VALID session (so the
		// happy path is the default) and a successful resign write.
		vi.clearAllMocks()
		mockService = mock<ResignMemberService>()
		mockAuthService = mock<AuthService>()
		mockService.execute.mockResolvedValue(ok(undefined))
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.MEMBER_RESIGN_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Auth (withAuth) — the route is staff-only", () => {
		it("returns 401 when the session_id cookie is missing", async () => {
			// Arrange — no cookie.
			const request = makeRequest("7")

			// Act
			const response = await POST(request, makeContext("7"))

			// Assert — withAuth rejects BEFORE the handler; the service is untouched.
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 401 when the session_id cookie is invalid", async () => {
			// Arrange — a TC-specific invalid session.
			mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))

			// Act
			const response = await POST(makeRequest("7", "bogus-session-id"), makeContext("7"))

			// Assert — service never reached.
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Happy cases", () => {
		it("resigns an EXPIRED member: 204 No Content, no body, service called with the parsed id", async () => {
			// Act
			const response = await POST(makeRequest("7", "valid-session"), makeContext("7"))

			// Assert
			expect(response.status).toBe(204)
			expect(await response.text()).toBe("")
			expect(mockService.execute).toHaveBeenCalledWith(7)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 for a non-integer id", async () => {
			// Act
			const response = await POST(makeRequest("abc", "valid-session"), makeContext("abc"))

			// Assert — validation fails before the service.
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 400 for a zero id", async () => {
			// Act
			const response = await POST(makeRequest("0", "valid-session"), makeContext("0"))

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 400 for a negative id", async () => {
			// Act
			const response = await POST(makeRequest("-5", "valid-session"), makeContext("-5"))

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 404 with the reused MemberNotFoundError message for a missing member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError()))

			// Act
			const response = await POST(makeRequest("999", "valid-session"), makeContext("999"))

			// Assert
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("not found this member id")
		})

		it("returns 409 with the single MemberNotExpiredError message for a non-EXPIRED member", async () => {
			// Arrange — covers every non-EXPIRED status AND the 0-row race: the
			// service collapses them to the one error.
			mockService.execute.mockResolvedValue(err(new MemberNotExpiredError()))

			// Act
			const response = await POST(makeRequest("7", "valid-session"), makeContext("7"))

			// Assert
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe(MemberNotExpiredError.DEFAULT_MESSAGE)
		})

		it("returns 500 with the generic body on a database error", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new DatabaseError("connection refused")))

			// Act
			const response = await POST(makeRequest("7", "valid-session"), makeContext("7"))

			// Assert — no leaky details in the body.
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
		})
	})
})
