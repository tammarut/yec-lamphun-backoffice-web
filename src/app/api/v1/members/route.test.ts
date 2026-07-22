import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberConflictError, MemberValidationError } from "src/modules/members/use-case/create-new-member/create-member.errors"
import { CreateNewMemberService } from "src/modules/members/use-case/create-new-member/create-new-member.service"
import { InvalidCursorError } from "src/modules/members/use-case/get-list-members/get-list-members.errors"
import { GetListMembersService } from "src/modules/members/use-case/get-list-members/get-list-members.service"
import type { ListMembersFilter, ListMembersPageResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"
import { CryptoError } from "src/modules/shared/crypto"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks
import { GET, POST } from "./route"

// A valid request body matching CreateMemberSchema (snake_case, as the client sends).
const validBody = {
	registration_type: "INDIVIDUAL",
	company_certificate: "members/documents/cert.jpg",
	id_card_image: "members/documents/idcard.jpg",
	profile_avatar: "members/avatars/a.jpg",
	title_name_th: "นาง",
	first_name_th: "มาลี",
	last_name_th: "รักสุข",
	title_name_en: "Miss",
	first_name_en: "Malee",
	last_name_en: "Raksuk",
	nickname: "malee",
	gender: "FEMALE",
	date_of_birth: "1985-08-20",
	nationality: "Thai",
	id_card_no: "1234567890123",
	id_card_expiry_date: "2027-08-19",
	phone_no: "0812345678",
	email: "malee@example.com",
	line_id: "malee.line",
	shirt_size: "M",
	position: "GENERAL_MEMBER",
	business: {
		name: "V Foods",
		juristic_registration_no: "105557026729",
		category_id: 1,
		address: "Bangkok",
		location: [13.72, 100.55],
		description: "desc",
		core_business: "canned food",
		website: "https://vfoods.co.th",
		logo: "members/business/logo.jpg",
		product: "members/business/product.jpg",
	},
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

function makeRequest(body: unknown): NextRequest {
	const req = new NextRequest("http://localhost/api/v1/members", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
	})
	req.cookies.set("session_id", "valid-session")
	return req
}

describe("POST /api/v1/members", () => {
	let mockService: ReturnType<typeof mock<CreateNewMemberService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<CreateNewMemberService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.CREATE_NEW_MEMBER_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 201 with the new member id on success", async () => {
			mockService.execute.mockResolvedValue(ok(102))

			const response = await POST(makeRequest(validBody), undefined)

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(201)
			const json = await response.json()
			expect(json).toEqual({ id: 102 })
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/members", {
				method: "POST",
				body: JSON.stringify(validBody),
			})
			const response = await POST(req, undefined)
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 400 when the JSON body is unparseable", async () => {
			const response = await POST(makeRequest("invalid-json"), undefined)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 when a required field is missing", async () => {
			const { first_name_th, ...missing } = validBody
			void first_name_th
			const response = await POST(makeRequest(missing), undefined)
			expect(response.status).toBe(400)
		})

		it("returns 400 when position is not a known enum value", async () => {
			const response = await POST(makeRequest({ ...validBody, position: "CHANCELLOR" }), undefined)
			expect(response.status).toBe(400)
		})

		it("returns 400 when location is not a 2-element array", async () => {
			const response = await POST(makeRequest({ ...validBody, business: { ...validBody.business, location: [1] } }), undefined)
			expect(response.status).toBe(400)
		})

		it("returns 409 on a duplicate id_card (MemberConflictError DUPLICATE_ID_CARD)", async () => {
			mockService.execute.mockResolvedValue(err(new MemberConflictError("DUPLICATE_ID_CARD", "A member with this ID card already exists")))
			const response = await POST(makeRequest(validBody), undefined)
			expect(response.status).toBe(409)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toContain("ID card")
		})

		it("returns 409 on an occupied SINGLE position (MemberConflictError POSITION_OCCUPIED)", async () => {
			mockService.execute.mockResolvedValue(err(new MemberConflictError("POSITION_OCCUPIED", "Position PRESIDENT is already held")))
			const response = await POST(makeRequest(validBody), undefined)
			expect(response.status).toBe(409)
		})

		it("returns 400 on a MemberValidationError (e.g. expired id_card)", async () => {
			mockService.execute.mockResolvedValue(err(new MemberValidationError("id_card_expiry_date must not be before today")))
			const response = await POST(makeRequest(validBody), undefined)
			expect(response.status).toBe(400)
		})

		it("returns 500 on a CryptoError (infra failure, no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new CryptoError("aes boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await POST(makeRequest(validBody), undefined)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})

		it("returns 500 on a DatabaseError", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("insert failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await POST(makeRequest(validBody), undefined)
			expect(response.status).toBe(500)
			consoleSpy.mockRestore()
		})
	})
})

// ============================================================================
// GET /api/v1/members — paginated list
// ============================================================================

function makeGetRequest(query: string): NextRequest {
	const req = new NextRequest(`http://localhost/api/v1/members${query}`, { method: "GET" })
	req.cookies.set("session_id", "valid-session")
	return req
}

const samplePage: ListMembersPageResponse = {
	data: [
		{
			id: 2,
			profile_avatar: "https://public.example/members/profile_avatars/a.png",
			registration_type: "INDIVIDUAL",
			title_name_th: "นาย",
			first_name_th: "สมชาย",
			last_name_th: "ใจดี",
			nickname: "cham",
			phone_no: "0812345678",
			email: "a@example.com",
			line_id: "a.line",
			position: "GENERAL_MEMBER",
			status: "ACTIVE",
			business: { name: "V Foods", description: "desc A" },
		},
	],
	has_more: true,
	next_cursor: "11",
}

describe("GET /api/v1/members", () => {
	let mockListService: ReturnType<typeof mock<GetListMembersService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockListService = mock<GetListMembersService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.GET_LIST_MEMBERS_SERVICE) return mockListService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the page body on a valid query", async () => {
			mockListService.execute.mockResolvedValue(ok(samplePage))

			const response = await GET(makeGetRequest("?limit=1"))

			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(samplePage)
		})

		it("returns 200 with an empty page when the result is empty (Q7 — no 404)", async () => {
			const emptyPage: ListMembersPageResponse = { data: [], has_more: false, next_cursor: null }
			mockListService.execute.mockResolvedValue(ok(emptyPage))

			const response = await GET(makeGetRequest(""))

			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(emptyPage)
		})

		it("is PUBLIC — returns 200 with no session_id cookie (spec declares security: [])", async () => {
			// Distinct from POST /members and GET /members/:id (both withAuth).
			// A regression that re-wraps this in withAuth would fail here: the
			// absent cookie would yield 401 instead of 200.
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))
			const req = new NextRequest("http://localhost/api/v1/members", { method: "GET" }) // no cookie set

			const response = await GET(req)

			expect(response.status).toBe(200)
		})

		it("applies defaults when no query params are present (limit=10, sort_by=created_at, sort_order=desc, no filters)", async () => {
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest(""))

			const expectedFilter: ListMembersFilter = {
				limit: 10,
				cursor: null,
				statuses: null,
				search: null,
				sortBy: "created_at",
				sortOrder: "desc",
			}
			expect(mockListService.execute).toHaveBeenCalledWith(expectedFilter)
		})

		it("parses status CSV into a statuses array", async () => {
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest("?status=ACTIVE,EXPIRED"))

			const filter = mockListService.execute.mock.calls[0]?.[0] as ListMembersFilter
			expect(filter.statuses).toEqual(["ACTIVE", "EXPIRED"])
		})

		it("treats an all-empty status CSV as no filter (Q10-c)", async () => {
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest("?status=,,"))

			const filter = mockListService.execute.mock.calls[0]?.[0] as ListMembersFilter
			expect(filter.statuses).toBeNull()
		})

		it("trims search and forwards it; empty search becomes null", async () => {
			mockListService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest("?search=%20%20somchai%20%20")) // "  somchai  "

			const filter = mockListService.execute.mock.calls[0]?.[0] as ListMembersFilter
			expect(filter.search).toBe("somchai")
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when limit is below 1", async () => {
			const response = await GET(makeGetRequest("?limit=0"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when limit exceeds 50", async () => {
			const response = await GET(makeGetRequest("?limit=51"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when limit is non-numeric", async () => {
			const response = await GET(makeGetRequest("?limit=abc"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when limit is fractional", async () => {
			// integer() must reject 1.5 — otherwise the LIMIT would be coerced
			// and the page size silently mis-resolved.
			const response = await GET(makeGetRequest("?limit=1.5"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when sort_by is not a known enum value", async () => {
			const response = await GET(makeGetRequest("?sort_by=foo"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when sort_order is not asc/desc", async () => {
			const response = await GET(makeGetRequest("?sort_order=sideways"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when status contains an unknown token", async () => {
			const response = await GET(makeGetRequest("?status=ACTIVE,FOO"))
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toContain("FOO")
		})

		it("returns 400 when cursor is non-numeric", async () => {
			const response = await GET(makeGetRequest("?cursor=abc"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when cursor is zero", async () => {
			const response = await GET(makeGetRequest("?cursor=0"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when cursor is negative", async () => {
			// minValue(1) must reject -1 — member ids are positive.
			const response = await GET(makeGetRequest("?cursor=-1"))
			expect(response.status).toBe(400)
		})

		it("returns 400 on InvalidCursorError (deleted anchor, Q3b)", async () => {
			mockListService.execute.mockResolvedValue(err(new InvalidCursorError()))
			const response = await GET(makeGetRequest("?cursor=999"))
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid cursor")
		})

		it("returns 500 on a DatabaseError (infra failure, no leaky details)", async () => {
			mockListService.execute.mockResolvedValue(err(new DatabaseError("query boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await GET(makeGetRequest(""))
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
