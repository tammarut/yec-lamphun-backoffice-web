// @vitest-environment node
import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.errors"
import { CreateManualRenewalService } from "src/modules/membership-renewals/use-case/create-renewal-manual/create-renewal-manual.service"
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
 * Tests never need a real route context, so this helper passes `undefined`.
 */
function callPost(body: unknown, sessionCookie?: string) {
	return POST(makeRequest(body, sessionCookie), undefined)
}

// A valid snake_case body, as the client sends it.
const validBody = {
	member_id: 1,
	payment_slip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
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

/**
 * Build a POST request. `sessionCookie` controls the session_id cookie:
 *   undefined -> no cookie (-> 401, since the route is withAuth-wrapped);
 *   any string -> that cookie value is set (the mock AuthService decides
 *   whether it's "valid" — defaults to VALID so the happy path is the default,
 *   override per-TC to err(...) for the invalid-cookie 401 case).
 */
function makeRequest(body: unknown, sessionCookie?: string): NextRequest {
	const req = new NextRequest("http://localhost/api/v1/membership/renewals/manual", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
	})
	if (sessionCookie !== undefined) {
		req.cookies.set("session_id", sessionCookie)
	}
	return req
}

describe("POST /api/v1/membership/renewals/manual", () => {
	let mockService: ReturnType<typeof mock<CreateManualRenewalService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<CreateManualRenewalService>()
		mockAuthService = mock<AuthService>()

		// Defaults: a VALID staff session (so the happy path is the default) and
		// a successful manual renewal insert.
		mockService.execute.mockResolvedValue(ok(71))
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.CREATE_MANUAL_RENEWAL_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Auth (withAuth) — the route is staff-only", () => {
		it("returns 401 when the session_id cookie is missing", async () => {
			const response = await callPost(validBody)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 401 when the session_id cookie is invalid", async () => {
			mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))

			const response = await callPost(validBody, "bogus-session-id")

			expect(mockAuthService.validateSession).toHaveBeenCalledWith("bogus-session-id")
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Happy cases", () => {
		it("returns 201 with the new renewal id on success", async () => {
			const response = await callPost(validBody, "valid-session-id")

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({ id: 71 })
		})

		it("passes the DTO WITHOUT an isAdmin flag (manual is always admin)", async () => {
			await callPost(validBody, "valid-session-id")

			expect(mockService.execute).toHaveBeenCalledWith({
				memberId: 1,
				paymentSlip: validBody.payment_slip,
			})
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when the JSON body is unparseable", async () => {
			const response = await callPost("invalid-json", "valid-session-id")
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 when member_id is missing", async () => {
			const { member_id, ...missing } = validBody
			void member_id
			const response = await callPost(missing, "valid-session-id")
			expect(response.status).toBe(400)
		})

		it("returns 400 when payment_slip is missing", async () => {
			const { payment_slip, ...missing } = validBody
			void payment_slip
			const response = await callPost(missing, "valid-session-id")
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_id is not a positive integer", async () => {
			const response = await callPost({ ...validBody, member_id: 0 }, "valid-session-id")
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_id is a string", async () => {
			const response = await callPost({ ...validBody, member_id: "abc" }, "valid-session-id")
			expect(response.status).toBe(400)
		})

		it("returns 404 when the service reports MemberNotFoundError", async () => {
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError()))
			const response = await callPost(validBody, "valid-session-id")
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("not found this member id")
		})

		it("returns 403 when the service reports ResignedMemberError", async () => {
			mockService.execute.mockResolvedValue(err(new ResignedMemberError()))
			const response = await callPost(validBody, "valid-session-id")
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("resigned members cannot submit renewal requests")
		})

		it("returns 409 when the service reports PendingRenewalExistsError", async () => {
			mockService.execute.mockResolvedValue(err(new PendingRenewalExistsError()))
			const response = await callPost(validBody, "valid-session-id")
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("You already have a pending renewal request")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await callPost(validBody, "valid-session-id")
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
