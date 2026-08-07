import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { AuthService } from "src/modules/auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.errors"
import { CreateRenewalService } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { POST } from "./route"

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
 *   undefined -> no cookie (public path);
 *   any string -> that cookie value is set (the mock AuthService decides
 *   whether it's "valid" — defaults to invalid, override per-TC for admin).
 */
function makeRequest(body: unknown, sessionCookie?: string): NextRequest {
	const req = new NextRequest("http://localhost/api/v1/membership/renewals", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
	})
	if (sessionCookie !== undefined) {
		req.cookies.set("session_id", sessionCookie)
	}
	return req
}

describe("POST /api/v1/membership/renewals", () => {
	let mockService: ReturnType<typeof mock<CreateRenewalService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<CreateRenewalService>()
		mockAuthService = mock<AuthService>()

		// Defaults: public path. validateSession defaults to INVALID so a cookie,
		// if present, behaves as not-admin unless a TC overrides to ok(...).
		mockService.execute.mockResolvedValue(ok(71))
		mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.CREATE_RENEWAL_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("PUBLIC (no cookie): returns 201 with the new renewal id", async () => {
			const response = await POST(makeRequest(validBody))

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({ id: 71 })
		})

		it("PUBLIC (no cookie): passes isAdmin=false to the service", async () => {
			await POST(makeRequest(validBody))

			expect(mockService.execute).toHaveBeenCalledWith({
				memberId: 1,
				paymentSlip: validBody.payment_slip,
				isAdmin: false,
			})
		})

		it("ADMIN (valid cookie): returns 201 and passes isAdmin=true", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const response = await POST(makeRequest(validBody, "valid-session-id"))

			expect(mockAuthService.validateSession).toHaveBeenCalledWith("valid-session-id")
			expect(mockService.execute).toHaveBeenCalledWith({
				memberId: 1,
				paymentSlip: validBody.payment_slip,
				isAdmin: true,
			})
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({ id: 71 })
		})

		it("INVALID cookie: treated as public (isAdmin=false), NOT 401", async () => {
			// validateSession already defaults to err -> invalid cookie = public.
			const response = await POST(makeRequest(validBody, "bogus-session-id"))

			expect(response.status).not.toBe(401)
			expect(response.status).toBe(201)
			expect(mockService.execute).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }))
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when the JSON body is unparseable", async () => {
			const response = await POST(makeRequest("invalid-json"))
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 when member_id is missing", async () => {
			const { member_id, ...missing } = validBody
			void member_id
			const response = await POST(makeRequest(missing))
			expect(response.status).toBe(400)
		})

		it("returns 400 when payment_slip is missing", async () => {
			const { payment_slip, ...missing } = validBody
			void payment_slip
			const response = await POST(makeRequest(missing))
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_id is not a positive integer", async () => {
			const response = await POST(makeRequest({ ...validBody, member_id: 0 }))
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_id is a string", async () => {
			const response = await POST(makeRequest({ ...validBody, member_id: "abc" }))
			expect(response.status).toBe(400)
		})

		it("returns 404 when the service reports MemberNotFoundError", async () => {
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError()))
			const response = await POST(makeRequest(validBody))
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("not found this member id")
		})

		it("returns 403 when the service reports ResignedMemberError", async () => {
			mockService.execute.mockResolvedValue(err(new ResignedMemberError()))
			const response = await POST(makeRequest(validBody))
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("resigned members cannot submit renewal requests")
		})

		it("returns 409 when the service reports PendingRenewalExistsError", async () => {
			mockService.execute.mockResolvedValue(err(new PendingRenewalExistsError()))
			const response = await POST(makeRequest(validBody))
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("You already have a pending renewal request")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await POST(makeRequest(validBody))
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
