import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberOrRenewalNotFoundError, RenewalNotFoundError } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.errors"
import { GetLatestRenewalByMemberIdService } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.service"
import type { LatestRenewalResponse } from "src/modules/members/use-case/get-latest-renewal-by-member-id/get-latest-renewal-by-member-id.types"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
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

// A representative successful response body.
const renewalResponse: LatestRenewalResponse = {
	id: 38,
	profile_avatar: "https://public/a.png",
	title_name_th: "นาย",
	first_name_th: "ก้องภพ",
	last_name_th: "จบไว",
	nickname: "ก้อง",
	phone_no: "0982738293",
	position: "GENERAL_MEMBER",
	business: { name: "บริษัท วี ฟู้ดส์" },
	renewal: {
		id: 59,
		payment_date_at: "2025-08-23T10:30:00.000Z",
		payment_slip: "https://presigned/slip.png",
	},
}

function makeRequest(memberId: string): { req: NextRequest; ctx: { params: Promise<{ member_id: string }> } } {
	const req = new NextRequest(`http://localhost/api/v1/membership/renewals/${memberId}`, { method: "GET" })
	req.cookies.set("session_id", "valid-session")
	return { req, ctx: { params: Promise.resolve({ member_id: memberId }) } }
}

describe("GET /api/v1/membership/renewals/:member_id", () => {
	let mockService: ReturnType<typeof mock<GetLatestRenewalByMemberIdService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetLatestRenewalByMemberIdService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.GET_LATEST_RENEWAL_BY_MEMBER_ID_SERVICE) return mockService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the latest-renewal view", async () => {
			mockService.execute.mockResolvedValue(ok(renewalResponse))
			const { req, ctx } = makeRequest("38")
			const response = await GET(req, ctx)
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(renewalResponse)
			// The service receives the parsed integer id.
			expect(mockService.execute).toHaveBeenCalledWith(38)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/membership/renewals/38", { method: "GET" })
			const response = await GET(req, { params: Promise.resolve({ member_id: "38" }) })
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 400 when member_id is not a valid integer (non-numeric)", async () => {
			const { req, ctx } = makeRequest("abc")
			const response = await GET(req, ctx)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("member_id parameter must be a valid integer")
		})

		it("returns 400 when member_id is zero / negative", async () => {
			const { req, ctx } = makeRequest("0")
			const response = await GET(req, ctx)
			expect(response.status).toBe(400)
		})

		it("returns 404 when the member is not found (MemberOrRenewalNotFoundError)", async () => {
			mockService.execute.mockResolvedValue(err(new MemberOrRenewalNotFoundError()))
			const { req, ctx } = makeRequest("999999")
			const response = await GET(req, ctx)
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Member or renewal not found")
		})

		it("returns 404 when the member has no renewal (RenewalNotFoundError)", async () => {
			mockService.execute.mockResolvedValue(err(new RenewalNotFoundError()))
			const { req, ctx } = makeRequest("38")
			const response = await GET(req, ctx)
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("No renewal records found")
		})

		it("returns 500 on a DatabaseError", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("query failed")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const { req, ctx } = makeRequest("38")
			const response = await GET(req, ctx)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
