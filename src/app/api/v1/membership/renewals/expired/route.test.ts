import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { InvalidCursorError } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.errors"
import { GetListExpiredMembershipService } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.service"
import type {
	ListExpiredMembershipFilter,
	ListExpiredMembershipPageResponse,
} from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks
import { GET } from "./route"

function makeGetRequest(query: string): NextRequest {
	return new NextRequest(`http://localhost/api/v1/membership/renewals/expired${query}`, { method: "GET" })
}

const samplePage: ListExpiredMembershipPageResponse = {
	data: [
		{
			id: 2,
			profile_avatar: "https://public.example/members/profile_avatars/a.png",
			title_name_th: "นาย",
			first_name_th: "สมชาย",
			last_name_th: "ใจดี",
			nickname: "cham",
			phone_no: "0812345678",
			position: "GENERAL_MEMBER",
			status: "EXPIRED",
			latest_renewal_status: "REJECTED",
			member_since: "2019-12-20T16:45:39.000Z",
		},
	],
	has_more: true,
	next_cursor: "2",
}

describe("GET /api/v1/membership/renewals/expired", () => {
	let mockService: ReturnType<typeof mock<GetListExpiredMembershipService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetListExpiredMembershipService>()

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.GET_LIST_EXPIRED_MEMBERSHIP_SERVICE) return mockService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the page body on a valid query", async () => {
			mockService.execute.mockResolvedValue(ok(samplePage))

			const response = await GET(makeGetRequest("?limit=1"))

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(samplePage)
		})

		it("returns 200 with an empty page when the result is empty (no 404)", async () => {
			const emptyPage: ListExpiredMembershipPageResponse = { data: [], has_more: false, next_cursor: null }
			mockService.execute.mockResolvedValue(ok(emptyPage))

			const response = await GET(makeGetRequest(""))

			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(emptyPage)
		})

		it("is PUBLIC — returns 200 with no session_id cookie (spec declares security: [])", async () => {
			// Grilling Q1: public, mirroring GET /members. A regression that
			// re-wraps this in withAuth would fail here: the absent cookie
			// would yield 401 instead of 200.
			mockService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))
			const req = new NextRequest("http://localhost/api/v1/membership/renewals/expired", { method: "GET" }) // no cookie set

			const response = await GET(req)

			expect(response.status).toBe(200)
		})

		it("applies defaults when no query params are present (limit=10, no cursor, no search)", async () => {
			mockService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest(""))

			const expectedFilter: ListExpiredMembershipFilter = {
				limit: 10,
				cursor: null,
				search: null,
			}
			expect(mockService.execute).toHaveBeenCalledWith(expectedFilter)
		})

		it("forwards limit and cursor as numbers", async () => {
			mockService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest("?limit=25&cursor=7"))

			const filter = mockService.execute.mock.calls[0]?.[0] as ListExpiredMembershipFilter
			expect(filter.limit).toBe(25)
			expect(filter.cursor).toBe(7)
		})

		it("accepts the spec's limit ceiling of 100 (unlike GET /members' 50)", async () => {
			mockService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			const response = await GET(makeGetRequest("?limit=100"))

			expect(response.status).toBe(200)
			const filter = mockService.execute.mock.calls[0]?.[0] as ListExpiredMembershipFilter
			expect(filter.limit).toBe(100)
		})

		it("trims search and forwards it; empty search becomes null", async () => {
			mockService.execute.mockResolvedValue(ok({ data: [], has_more: false, next_cursor: null }))

			await GET(makeGetRequest("?search=%20%20somchai%20%20")) // "  somchai  "

			const filter = mockService.execute.mock.calls[0]?.[0] as ListExpiredMembershipFilter
			expect(filter.search).toBe("somchai")

			await GET(makeGetRequest("?search=%20%20"))

			const filter2 = mockService.execute.mock.calls[1]?.[0] as ListExpiredMembershipFilter
			expect(filter2.search).toBeNull()
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when limit is below 1", async () => {
			const response = await GET(makeGetRequest("?limit=0"))
			expect(response.status).toBe(400)
		})

		it("returns 400 when limit exceeds 100", async () => {
			const response = await GET(makeGetRequest("?limit=101"))
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

		it("returns 400 on InvalidCursorError (deleted anchor)", async () => {
			mockService.execute.mockResolvedValue(err(new InvalidCursorError()))
			const response = await GET(makeGetRequest("?cursor=999"))
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid cursor")
		})

		it("returns 500 on a DatabaseError (infra failure, no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("query boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const response = await GET(makeGetRequest(""))
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
