import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { SearchBusinessesService } from "src/modules/members/use-case/search-businesses/search-businesses.service"
import type { BusinessSearchItem } from "src/modules/members/use-case/search-businesses/search-businesses.types"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Mock the logger wrapper so route code's logger.error calls don't leak into
// test output. Matches the canonical route-test pattern (mock the seam, not
// the underlying library). See docs/adr/0009.
vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

// Import route AFTER mocks.
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

/** A representative service item (camelCase, as the repository maps rows). */
const searchItem: BusinessSearchItem = {
	id: 14,
	name: "V Foods",
	juristicRegistrationNo: "105557026729",
	categoryName: "เกษตร อาหาร และทรัพยากรชีวภาพ",
	address: "Lamphun",
	memberCount: 2,
	ownerNames: ["ประเสริฐ โชคดี", "มาลี รักสุข"],
}

/** Build a GET NextRequest with optional query params + a valid session cookie. */
function makeGetRequest(query: Record<string, string>): NextRequest {
	const search = new URLSearchParams(query).toString()
	const url = `http://localhost/api/v1/business/search${search ? `?${search}` : ""}`
	const req = new NextRequest(url, { method: "GET" })
	req.cookies.set("session_id", "valid-session")
	return req
}

describe("GET /api/v1/business/search", () => {
	let mockService: ReturnType<typeof mock<SearchBusinessesService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<SearchBusinessesService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.BUSINESS_SEARCH_SERVICE) return mockService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the mapped wrapper body (snake_case fields, owner_names passthrough)", async () => {
			mockService.execute.mockResolvedValue(ok([searchItem]))
			const response = await GET(makeGetRequest({ search: "V Foods" }), undefined)
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({
				businesses: [
					{
						id: 14,
						name: "V Foods",
						juristic_registration_no: "105557026729",
						category_name: "เกษตร อาหาร และทรัพยากรชีวภาพ",
						address: "Lamphun",
						member_count: 2,
						owner_names: ["ประเสริฐ โชคดี", "มาลี รักสุข"],
					},
				],
			})
			expect(container.resolve).toHaveBeenCalledWith(REGISTER_KEY.BUSINESS_SEARCH_SERVICE)
			expect(mockService.execute).toHaveBeenCalledWith({ limit: 10, search: "V Foods" })
		})

		it("returns 200 with an empty businesses array when the result is empty", async () => {
			mockService.execute.mockResolvedValue(ok([]))
			const response = await GET(makeGetRequest({}), undefined)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({ businesses: [] })
		})

		it("applies defaults when no query params are present (limit=10, search=null)", async () => {
			mockService.execute.mockResolvedValue(ok([]))
			const response = await GET(makeGetRequest({}), undefined)
			expect(response.status).toBe(200)
			expect(mockService.execute).toHaveBeenCalledWith({ limit: 10, search: null })
		})

		it('trims the search param ("  somchai  " reaches the service as "somchai")', async () => {
			mockService.execute.mockResolvedValue(ok([]))
			const response = await GET(makeGetRequest({ search: "  somchai  " }), undefined)
			expect(response.status).toBe(200)
			expect(mockService.execute).toHaveBeenCalledWith({ limit: 10, search: "somchai" })
		})

		it("accepts the lower boundary limit=1", async () => {
			mockService.execute.mockResolvedValue(ok([]))
			const response = await GET(makeGetRequest({ limit: "1" }), undefined)
			expect(response.status).toBe(200)
			expect(mockService.execute).toHaveBeenCalledWith({ limit: 1, search: null })
		})

		it("accepts the upper boundary limit=50", async () => {
			mockService.execute.mockResolvedValue(ok([]))
			const response = await GET(makeGetRequest({ limit: "50" }), undefined)
			expect(response.status).toBe(200)
			expect(mockService.execute).toHaveBeenCalledWith({ limit: 50, search: null })
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/business/search", { method: "GET" }) // no cookie set
			const response = await GET(req, undefined)
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 401 when validateSession fails", async () => {
			mockAuthService.validateSession.mockReturnValue(err(new Error("session expired")))
			const response = await GET(makeGetRequest({}), undefined)
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it('returns 400 when limit is below the minimum ("0")', async () => {
			const response = await GET(makeGetRequest({ limit: "0" }), undefined)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("limit must be at least 1")
			expect(mockService.execute).not.toHaveBeenCalled()
		})

		it('returns 400 when limit is above the maximum ("51")', async () => {
			const response = await GET(makeGetRequest({ limit: "51" }), undefined)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("limit must be at most 50")
		})

		it('returns 400 when limit is not numeric ("abc")', async () => {
			const response = await GET(makeGetRequest({ limit: "abc" }), undefined)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid integer: Received NaN")
		})

		it('returns 400 when limit is not an integer ("1.5")', async () => {
			const response = await GET(makeGetRequest({ limit: "1.5" }), undefined)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid integer: Received 1.5")
		})

		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("search failed")))
			const response = await GET(makeGetRequest({}), undefined)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
		})
	})
})
