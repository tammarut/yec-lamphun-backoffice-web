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
import { RenewalAlreadyReviewedError, RenewalNotFoundError } from "src/modules/membership-renewals/use-case/review-renewal/review-renewal.errors"
import { ReviewRenewalService } from "src/modules/membership-renewals/use-case/review-renewal/review-renewal.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { PATCH } from "./route"

/** PATCH is a withAuth-wrapped handler with the signature (request, context). */
function callPatch(renewalId: string, body: unknown, sessionCookie?: string) {
	return PATCH(makeRequest(renewalId, body, sessionCookie), makeContext(renewalId))
}

/** Next 16 route context: dynamic params arrive as a Promise. */
function makeContext(renewalId: string) {
	return { params: Promise.resolve({ renewal_id: renewalId }) }
}

// The spec's own example bodies.
const approveBody = { status: "APPROVED", reason: null }
const rejectBody = { status: "REJECTED", reason: "สลิปไม่ชัด" }

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
 * Build a PATCH request. `sessionCookie` controls the session_id cookie:
 * undefined -> no cookie (-> 401); any string -> that cookie value (the mock
 * AuthService decides validity — defaults to VALID so the happy path is the
 * default).
 */
function makeRequest(renewalId: string, body: unknown, sessionCookie?: string): NextRequest {
	const req = new NextRequest(`http://localhost/api/v1/membership/renewals/review/${renewalId}`, {
		method: "PATCH",
		body: typeof body === "string" ? body : JSON.stringify(body),
	})
	if (sessionCookie !== undefined) {
		req.cookies.set("session_id", sessionCookie)
	}
	return req
}

describe("PATCH /api/v1/membership/renewals/review/{renewal_id}", () => {
	let mockService: ReturnType<typeof mock<ReviewRenewalService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<ReviewRenewalService>()
		mockAuthService = mock<AuthService>()

		// Defaults: a VALID staff session (so the happy path is the default) and
		// a successful review application.
		mockService.execute.mockResolvedValue(ok(undefined))
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.REVIEW_RENEWAL_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Auth (withAuth) — the route is staff-only", () => {
		it("returns 401 when the session_id cookie is missing", async () => {
			const response = await callPatch("79", rejectBody)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 401 when the session_id cookie is invalid", async () => {
			mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))

			const response = await callPatch("79", rejectBody, "bogus-session-id")

			expect(mockAuthService.validateSession).toHaveBeenCalledWith("bogus-session-id")
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Happy cases", () => {
		it("returns 204 with an empty body on approve", async () => {
			const response = await callPatch("79", approveBody, "valid-session-id")

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(204)
			expect(response.body).toBeNull()
		})

		it("returns 204 with an empty body on reject", async () => {
			const response = await callPatch("79", rejectBody, "valid-session-id")

			expect(response.status).toBe(204)
			expect(response.body).toBeNull()
		})

		it("passes the DTO with the path renewal_id, the decision, and the reason", async () => {
			await callPatch("79", rejectBody, "valid-session-id")

			expect(mockService.execute).toHaveBeenCalledWith({
				renewalId: 79,
				decision: "REJECTED",
				reason: "สลิปไม่ชัด",
			})
		})

		it("normalizes an absent reason to null on approve", async () => {
			const response = await callPatch("79", { status: "APPROVED" }, "valid-session-id")

			expect(response.status).toBe(204)
			expect(mockService.execute).toHaveBeenCalledWith({
				renewalId: 79,
				decision: "APPROVED",
				reason: null,
			})
		})
	})

	describe("Unhappy cases — path parameter", () => {
		it.each(["abc", "1.5", "0", "-3", ""])("returns 400 'invalid renewal_id' for renewal_id=%s", async (rawId) => {
			const response = await callPatch(rawId, rejectBody, "valid-session-id")

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("invalid renewal_id")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Unhappy cases — request body", () => {
		it("returns 400 when the JSON body is unparseable", async () => {
			const response = await callPatch("79", "invalid-json", "valid-session-id")

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 when status is missing", async () => {
			const response = await callPatch("79", {}, "valid-session-id")

			expect(response.status).toBe(400)
		})

		it("returns 400 when status is outside the enum", async () => {
			const response = await callPatch("79", { status: "MAYBE" }, "valid-session-id")

			expect(response.status).toBe(400)
		})
	})

	describe("Unhappy cases — status/reason pairing (spec's validation rule)", () => {
		it.each([
			{ label: "REJECTED with null reason", body: { status: "REJECTED", reason: null } },
			{ label: "REJECTED with empty reason", body: { status: "REJECTED", reason: "" } },
			{ label: "REJECTED with whitespace-only reason", body: { status: "REJECTED", reason: "   " } },
			{ label: "REJECTED with absent reason", body: { status: "REJECTED" } },
			{ label: "APPROVED with a non-empty reason", body: { status: "APPROVED", reason: "ยอดเงินไม่ถูกต้อง" } },
		])("returns 400 'status and reason are incorrect' for $label", async ({ body }) => {
			const response = await callPatch("79", body, "valid-session-id")

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("status and reason are incorrect")
			expect(mockService.execute).not.toHaveBeenCalled()
		})
	})

	describe("Unhappy cases — domain outcomes", () => {
		it("returns 404 'not found this renewal' when the service reports RenewalNotFoundError", async () => {
			mockService.execute.mockResolvedValue(err(new RenewalNotFoundError()))

			const response = await callPatch("79", rejectBody, "valid-session-id")

			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("not found this renewal")
		})

		it("returns 409 'This renewal has been reviewed' when the service reports RenewalAlreadyReviewedError", async () => {
			mockService.execute.mockResolvedValue(err(new RenewalAlreadyReviewedError()))

			const response = await callPatch("79", rejectBody, "valid-session-id")

			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("This renewal has been reviewed")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const response = await callPatch("79", rejectBody, "valid-session-id")

			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
