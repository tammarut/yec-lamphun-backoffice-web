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

// A valid snake_case body, as the client sends it (ADR-0026 contract — solo
// submission = member_ids of one, main member first).
const validBody = {
	member_ids: [1],
	payment_slip: "members/documents/payment_slip_01KDNJJM9BVVRMWZ46DVS4Y1YD.jpg",
}

// The service result the mocked use case resolves to by default (solo submission).
const soloServiceResult = {
	renewals: [{ memberId: 1, renewalId: 71 }],
	groupId: null,
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
		// Arrange (shared setup): staff path defaults — a VALID session (so the
		// happy path is the default) and a successful manual renewal write.
		vi.clearAllMocks()
		mockService = mock<CreateManualRenewalService>()
		mockAuthService = mock<AuthService>()
		mockService.execute.mockResolvedValue(ok(soloServiceResult))
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
			// Arrange — no cookie.
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request, undefined)

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
			const response = await callPost(validBody, "bogus-session-id")

			// Assert
			expect(mockAuthService.validateSession).toHaveBeenCalledWith("bogus-session-id")
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Happy cases", () => {
		it("returns 201 with the per-member renewals + null group_id on success", async () => {
			// Arrange — default valid session + solo service result.

			// Act
			const response = await callPost(validBody, "valid-session-id")

			// Assert — the manual route now speaks the SAME snake_case contract as
			// the public route (ADR-0026): one row per member + the group marker.
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({
				renewals: [{ member_id: 1, renewal_id: 71 }],
				group_id: null,
			})
		})

		it("passes the member_ids array WITHOUT an isAdmin flag (manual is always admin)", async () => {
			// Arrange — default valid session.

			// Act
			await callPost(validBody, "valid-session-id")

			// Assert — the array is relayed as-is; no isAdmin on the DTO.
			expect(mockService.execute).toHaveBeenCalledWith({
				memberIds: [1],
				paymentSlip: validBody.payment_slip,
			})
		})

		it("3-member group (fan-out live, #85): returns 201 with one row per member + the minted group_id", async () => {
			// Arrange — the service mints the marker and advances every clock; the
			// route relays the outcome verbatim.
			mockService.execute.mockResolvedValue(
				ok({
					renewals: [
						{ memberId: 15, renewalId: 81 },
						{ memberId: 16, renewalId: 82 },
						{ memberId: 17, renewalId: 83 },
					],
					groupId: "01900000-0000-7000-8000-000000000001",
				})
			)

			// Act
			const response = await callPost({ ...validBody, member_ids: [15, 16, 17] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({
				renewals: [
					{ member_id: 15, renewal_id: 81 },
					{ member_id: 16, renewal_id: 82 },
					{ member_id: 17, renewal_id: 83 },
				],
				group_id: "01900000-0000-7000-8000-000000000001",
			})
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when the JSON body is unparseable", async () => {
			// Arrange
			const request = makeRequest("invalid-json", "valid-session-id")

			// Act
			const response = await POST(request, undefined)

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 on the OLD contract shape (member_id instead of member_ids)", async () => {
			// Arrange — a pre-#85 client body.
			const oldBody = { member_id: 1, payment_slip: validBody.payment_slip }

			// Act
			const response = await callPost(oldBody, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 400 when member_ids is missing", async () => {
			// Arrange
			const { member_ids, ...missing } = validBody
			void member_ids

			// Act
			const response = await callPost(missing, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids is empty", async () => {
			// Act
			const response = await callPost({ ...validBody, member_ids: [] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids has more than 6 entries", async () => {
			// Act
			const response = await callPost({ ...validBody, member_ids: [1, 2, 3, 4, 5, 6, 7] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids contains duplicates", async () => {
			// Act
			const response = await callPost({ ...validBody, member_ids: [1, 1] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when a member_ids entry is not a positive integer", async () => {
			// Act
			const response = await callPost({ ...validBody, member_ids: [0] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when a member_ids entry is a string", async () => {
			// Act
			const response = await callPost({ ...validBody, member_ids: ["abc"] }, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when payment_slip is missing", async () => {
			// Arrange
			const { payment_slip, ...missing } = validBody
			void payment_slip

			// Act
			const response = await callPost(missing, "valid-session-id")

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 404 when the service reports MemberNotFoundError, naming the member", async () => {
			// Arrange — first ineligible member in request order.
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError("member_id 7 not found")))

			// Act
			const response = await callPost(validBody, "valid-session-id")

			// Assert
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 7 not found")
		})

		it("returns 403 when the service reports ResignedMemberError, naming the member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new ResignedMemberError("member_id 8 is resigned — resigned members cannot submit renewal requests")))

			// Act
			const response = await callPost(validBody, "valid-session-id")

			// Assert
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 8 is resigned — resigned members cannot submit renewal requests")
		})

		it("returns 409 when the service reports PendingRenewalExistsError, naming the member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new PendingRenewalExistsError("member_id 9 already has a pending renewal request")))

			// Act
			const response = await callPost(validBody, "valid-session-id")

			// Assert
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 9 already has a pending renewal request")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Act
			const response = await callPost(validBody, "valid-session-id")

			// Assert
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
