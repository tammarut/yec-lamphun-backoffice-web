import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { AuthService } from "src/modules/auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { RateLimiterService, RATE_LIMIT_BUDGETS } from "src/modules/shared/rate-limiter/rate-limiter.service"
import { MemberNotFoundError, PendingRenewalExistsError, ResignedMemberError } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.errors"
import { CreateRenewalService } from "src/modules/membership-renewals/use-case/create-renewal/create-renewal.service"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { InvalidCursorError } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.errors"
import { GetListMembershipRenewalService } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.service"
import type { ListMembershipRenewalPageResponse } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { GET, POST } from "./route"

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

/** POST request with explicit headers — the SEC-2 gate/budget cases need an Origin/Referer set. */
function makeRequestWithHeaders(body: unknown, headers: Record<string, string>): NextRequest {
	return new NextRequest("http://localhost/api/v1/membership/renewals", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
		headers: headers,
	})
}

describe("POST /api/v1/membership/renewals", () => {
	let mockService: ReturnType<typeof mock<CreateRenewalService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>
	let mockSettingsService: ReturnType<typeof mock<SystemSettingsService>>
	let limiter: RateLimiterService

	beforeEach(() => {
		// Arrange (shared setup): public path defaults. validateSession defaults
		// to INVALID so a cookie, if present, behaves as not-admin unless a TC
		// overrides to ok(...). The renewal window defaults to OPEN (the SEC-4
		// gate passes) unless a TC overrides to ok(false).
		vi.clearAllMocks()
		mockService = mock<CreateRenewalService>()
		mockAuthService = mock<AuthService>()
		mockSettingsService = mock<SystemSettingsService>()
		mockService.execute.mockResolvedValue(ok(soloServiceResult))
		mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))
		mockSettingsService.isRenewalWindowOpen.mockResolvedValue(ok(true))
		// ONE limiter instance per test: resolving a fresh RateLimiterService per
		// call would give every request its own empty window and the write budget
		// could never trip (the container registers it as a Singleton).
		limiter = new RateLimiterService(() => new Date())

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.CREATE_RENEWAL_SERVICE) {
				return mockService
			}
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
				return limiter
			}
			if (token === REGISTER_KEY.SYSTEM_SETTINGS_SERVICE) {
				return mockSettingsService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("PUBLIC (no cookie): returns 201 with the per-member renewals + null group_id", async () => {
			// Arrange
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({
				renewals: [{ member_id: 1, renewal_id: 71 }],
				group_id: null,
			})
		})

		it("PUBLIC (no cookie): passes isAdmin=false and the member_ids array to the service", async () => {
			// Arrange
			const request = makeRequest(validBody)

			// Act
			await POST(request)

			// Assert
			expect(mockService.execute).toHaveBeenCalledWith({
				memberIds: [1],
				paymentSlip: validBody.payment_slip,
				isAdmin: false,
			})
		})

		it("ADMIN (valid cookie): returns 201 and passes isAdmin=true", async () => {
			// Arrange — a TC-specific valid session.
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))
			const request = makeRequest(validBody, "valid-session-id")

			// Act
			const response = await POST(request)

			// Assert
			expect(mockAuthService.validateSession).toHaveBeenCalledWith("valid-session-id")
			expect(mockService.execute).toHaveBeenCalledWith({
				memberIds: [1],
				paymentSlip: validBody.payment_slip,
				isAdmin: true,
			})
			expect(response.status).toBe(201)
			expect(await response.json()).toEqual({
				renewals: [{ member_id: 1, renewal_id: 71 }],
				group_id: null,
			})
		})

		it("INVALID cookie: treated as public (isAdmin=false), NOT 401", async () => {
			// Arrange — validateSession already defaults to err -> invalid cookie = public.
			const request = makeRequest(validBody, "bogus-session-id")

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).not.toBe(401)
			expect(response.status).toBe(201)
			expect(mockService.execute).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }))
		})

		it("3-member group (fan-out live, #85): returns 201 with one row per member + the minted group_id", async () => {
			// Arrange — the service mints the marker and returns one row per member,
			// in request order; the route relays it verbatim.
			const groupBody = { ...validBody, member_ids: [15, 16, 17] }
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
			const request = makeRequest(groupBody)

			// Act
			const response = await POST(request)

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

		it("passes with NO Origin header (plain curl / Apidog unaffected — gate passes absent headers)", async () => {
			// Arrange
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(201)
		})

		it("SEC-4: OPEN season + guest (no cookie): proceeds to the use case (behavior unchanged)", async () => {
			// Arrange — beforeEach defaults the window to open.
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(mockSettingsService.isRenewalWindowOpen).toHaveBeenCalledTimes(1)
			expect(response.status).toBe(201)
		})

		it("SEC-4: CLOSED season + ADMIN (valid cookie): bypasses the window check entirely", async () => {
			// Arrange — window closed, but the session is a valid staff session.
			mockSettingsService.isRenewalWindowOpen.mockResolvedValue(ok(false))
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))
			const request = makeRequest(validBody, "valid-session-id")

			// Act
			const response = await POST(request)

			// Assert — the flag is never read on the admin path; the submission proceeds.
			expect(mockSettingsService.isRenewalWindowOpen).not.toHaveBeenCalled()
			expect(response.status).toBe(201)
			expect(mockService.execute).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }))
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when the JSON body is unparseable", async () => {
			// Arrange
			const request = makeRequest("invalid-json")

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 on the OLD contract shape (member_id instead of member_ids)", async () => {
			// Arrange
			const request = makeRequest({ member_id: 1, payment_slip: validBody.payment_slip })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids is missing", async () => {
			// Arrange
			const { member_ids, ...missing } = validBody
			void member_ids
			const request = makeRequest(missing)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids is empty", async () => {
			// Arrange
			const request = makeRequest({ ...validBody, member_ids: [] })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids exceeds 6 entries", async () => {
			// Arrange
			const request = makeRequest({ ...validBody, member_ids: [1, 2, 3, 4, 5, 6, 7] })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when member_ids contains duplicates", async () => {
			// Arrange
			const request = makeRequest({ ...validBody, member_ids: [1, 2, 2] })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 400 when a member_ids entry is not a positive integer", async () => {
			for (const bad of [0, -3, 1.5, "abc"]) {
				// Arrange
				const request = makeRequest({ ...validBody, member_ids: [bad] })

				// Act
				const response = await POST(request)

				// Assert
				expect(response.status).toBe(400)
			}
		})

		it("returns 400 when payment_slip is missing", async () => {
			// Arrange
			const { payment_slip, ...missing } = validBody
			void payment_slip
			const request = makeRequest(missing)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(400)
		})

		it("returns 404 when the service reports MemberNotFoundError, naming the member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError("member_id 7 not found")))
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 7 not found")
		})

		it("returns 403 when the service reports ResignedMemberError, naming the member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new ResignedMemberError("member_id 8 is resigned — resigned members cannot submit renewal requests")))
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 8 is resigned — resigned members cannot submit renewal requests")
		})

		it("returns 409 when the service reports PendingRenewalExistsError, naming the member", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new PendingRenewalExistsError("member_id 9 already has a pending renewal request")))
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id 9 already has a pending renewal request")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			// Arrange
			mockService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})

		it("returns 403 when the Origin header is present but not allow-listed", async () => {
			// Arrange — the container mock resolves ENV_CONFIG to {} (no allow-list),
			// so any Origin-bearing request is foreign.
			const request = makeRequestWithHeaders(validBody, { origin: "https://evil.example.net" })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Forbidden")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 403 via the Referer fallback when Origin is absent and Referer is foreign", async () => {
			// Arrange
			const request = makeRequestWithHeaders(validBody, { referer: "https://evil.example.net/spam" })

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(403)
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("returns 429 with Retry-After once the RENEWAL_SUBMIT budget (20/hour) exhausts", async () => {
			// Arrange — the beforeEach limiter is fresh, so exactly 20 pass.
			const budget = RATE_LIMIT_BUDGETS["RENEWAL_SUBMIT"]
			for (let i = 0; i < budget.limit; i += 1) {
				const underBudget = await POST(makeRequest(validBody))
				expect(underBudget.status).toBe(201)
			}

			// Act
			const overBudget = await POST(makeRequest(validBody))

			// Assert
			expect(overBudget.status).toBe(429)
			const json = (await overBudget.json()) as ResponseBodyError
			expect(json.error_message).toBe("Too Many Requests")
			expect(overBudget.headers.get("Retry-After")).toBe(String(budget.windowMs / 1000))
		})

		it("SEC-4: CLOSED season + guest (no cookie): 403 before the use case runs (409 stays duplicate-only)", async () => {
			// Arrange
			mockSettingsService.isRenewalWindowOpen.mockResolvedValue(ok(false))
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("membership renewal is currently closed")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it("SEC-4: settings read fails + guest: 500 fail-closed, use case never runs", async () => {
			// Arrange
			mockSettingsService.isRenewalWindowOpen.mockResolvedValue(err(new DatabaseError("settings query failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const request = makeRequest(validBody)

			// Act
			const response = await POST(request)

			// Assert
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			expect(mockService.execute).not.toHaveBeenCalled()
			consoleSpy.mockRestore()
		})
	})
})

/** Build a GET request against the list endpoint with the given query string. */
function makeGetRequest(queryString: string): NextRequest {
	return new NextRequest(`http://localhost/api/v1/membership/renewals${queryString}`, { method: "GET" })
}

// A representative page the mocked list service resolves to by default.
const listPage: ListMembershipRenewalPageResponse = {
	data: [
		{
			id: 2,
			renewal_id: 71,
			profile_avatar: "https://public.example/members/profile_avatars/a.png",
			title_name_th: "นาย",
			first_name_th: "สมชาย",
			last_name_th: "ใจดี",
			nickname: "cham",
			phone_no: "0812345678",
			position: "GENERAL_MEMBER",
			status: "PENDING_REVIEW",
			member_since: "2019-12-20T16:45:39.000Z",
			payment_date_at: "2025-12-18T07:30:00.000Z",
			group_id: null,
			group_size: 1,
		},
	],
	has_more: true,
	next_cursor: "11",
}

describe("GET /api/v1/membership/renewals", () => {
	let mockListService: ReturnType<typeof mock<GetListMembershipRenewalService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockListService = mock<GetListMembershipRenewalService>()
		mockListService.execute.mockResolvedValue(ok(listPage))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.GET_LIST_MEMBERSHIP_RENEWAL_SERVICE) {
				return mockListService
			}
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
				return new RateLimiterService(() => new Date())
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the page envelope", async () => {
			// Arrange
			const request = makeGetRequest("?status=PENDING_REVIEW")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(listPage)
		})

		it("PUBLIC (no cookie): serves the list without resolving any auth — no 401 path", async () => {
			// Arrange
			const request = makeGetRequest("?status=APPROVED")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(200)
			expect(vi.mocked(container.resolve)).not.toHaveBeenCalledWith(REGISTER_KEY.AUTH_SERVICE)
		})

		it("defaults: absent limit/cursor/search become 10/null/null; status forwarded", async () => {
			// Arrange
			const request = makeGetRequest("?status=PENDING_REVIEW")

			// Act
			await GET(request)

			// Assert
			expect(mockListService.execute).toHaveBeenCalledWith({
				limit: 10,
				cursor: null,
				status: "PENDING_REVIEW",
				search: null,
			})
		})

		it("forwards parsed numeric limit/cursor and the status enum value", async () => {
			// Arrange
			const request = makeGetRequest("?limit=25&cursor=15&status=APPROVED&search=สมชาย")

			// Act
			await GET(request)

			// Assert
			expect(mockListService.execute).toHaveBeenCalledWith({
				limit: 25,
				cursor: 15,
				status: "APPROVED",
				search: "สมชาย",
			})
		})

		it("trims search; empty/whitespace search becomes null", async () => {
			// Arrange
			const request = makeGetRequest("?status=PENDING_REVIEW&search=%20%20")

			// Act
			await GET(request)

			// Assert
			expect(mockListService.execute).toHaveBeenCalledWith(expect.objectContaining({ search: null }))
		})

		it("empty page — 200 with data: [], has_more: false, next_cursor: null", async () => {
			// Arrange
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))
			const request = makeGetRequest("?status=APPROVED")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({ data: [], has_more: false, next_cursor: null })
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when status is missing", async () => {
			// Arrange
			const request = makeGetRequest("")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("status must be PENDING_REVIEW or APPROVED")
		})

		it("returns 400 when status is not one of the two listable Renewal Statuses", async () => {
			for (const status of ["REJECTED", "EXPIRED", "pending_review", ""]) {
				// Arrange
				const request = makeGetRequest(`?status=${status}`)

				// Act
				const response = await GET(request)

				// Assert
				expect(response.status).toBe(400)
			}
		})

		it("returns 400 when limit is out of range or non-integer", async () => {
			for (const limit of ["0", "101", "abc", "1.5", "-1"]) {
				// Arrange
				const request = makeGetRequest(`?status=PENDING_REVIEW&limit=${limit}`)

				// Act
				const response = await GET(request)

				// Assert
				expect(response.status).toBe(400)
			}
		})

		it("returns 400 when cursor is non-numeric, zero, or negative", async () => {
			for (const cursor of ["abc", "0", "-1", "1.5"]) {
				// Arrange
				const request = makeGetRequest(`?status=PENDING_REVIEW&cursor=${cursor}`)

				// Act
				const response = await GET(request)

				// Assert
				expect(response.status).toBe(400)
			}
		})

		it("returns 400 { error_message: 'Invalid cursor' } when the service reports InvalidCursorError", async () => {
			// Arrange
			mockListService.execute.mockResolvedValue(err(new InvalidCursorError()))
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const request = makeGetRequest("?status=PENDING_REVIEW&cursor=999")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid cursor")
			consoleSpy.mockRestore()
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			// Arrange
			mockListService.execute.mockResolvedValue(err(new DatabaseError("boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const request = makeGetRequest("?status=PENDING_REVIEW")

			// Act
			const response = await GET(request)

			// Assert
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
