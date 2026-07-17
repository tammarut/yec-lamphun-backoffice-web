import { err, ok } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberNotFoundError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
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
const memberResponse: MemberDetailResponse = {
	id: 101,
	registration_type: "INDIVIDUAL",
	company_certificate: "https://presigned/cert.jpg",
	id_card_image: "https://presigned/id.jpg",
	profile_avatar: "https://public/a.png",
	title_name_th: "นาย",
	first_name_th: "ประเสริฐ",
	last_name_th: "โชคดี",
	title_name_en: "Mr.",
	first_name_en: "Prasert",
	last_name_en: "Chokdee",
	nickname: "prasert",
	gender: "MALE",
	date_of_birth: "1990-05-15",
	nationality: "Thai",
	id_card_no: "632XXXXXX1483",
	id_card_expiry_date: "2025-12-31",
	member_since: "2024-01-18T16:00:00.000Z",
	expires_at: "2025-01-18T23:59:59.000Z",
	phone_no: "0872492219",
	email: "prasert.c@example.com",
	line_id: "prasert.line",
	shirt_size: "L",
	position: "GENERAL_MEMBER",
	status: "ACTIVE",
	created_at: "2024-01-18T16:00:00.000Z",
	updated_at: "2024-01-18T16:00:00.000Z",
	business: {
		id: 14,
		name: "V Foods",
		description: "desc",
		juristic_registration_no: "105557026729",
		category_id: 73,
		address: "Bangkok",
		location: [13.7207, 100.5596],
		core_business: null,
		website: "https://vfoods.co.th",
		logo: "https://public/logo.png",
		product: null,
		created_at: "2025-12-26T16:22:49.216Z",
		updated_at: "2025-05-06T00:00:00.000Z",
	},
}

function makeRequest(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
	const req = new NextRequest(`http://localhost/api/v1/members/${id}`, { method: "GET" })
	req.cookies.set("session_id", "valid-session")
	return { req, ctx: { params: Promise.resolve({ id }) } }
}

describe("GET /api/v1/members/:id", () => {
	let mockService: ReturnType<typeof mock<GetMemberByIdService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetMemberByIdService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.GET_MEMBER_BY_ID_SERVICE) return mockService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the member detail", async () => {
			mockService.execute.mockResolvedValue(ok(memberResponse))
			const { req, ctx } = makeRequest("101")
			const response = await GET(req, ctx)
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(memberResponse)
			expect(mockService.execute).toHaveBeenCalledWith(101)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/members/101", { method: "GET" })
			const response = await GET(req, { params: Promise.resolve({ id: "101" }) })
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 400 when id is not a valid integer (non-numeric)", async () => {
			const { req, ctx } = makeRequest("abc")
			const response = await GET(req, ctx)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
		})

		it("returns 400 when id is zero / negative", async () => {
			const { req, ctx } = makeRequest("0")
			const response = await GET(req, ctx)
			expect(response.status).toBe(400)
		})

		it("returns 404 when the member is not found", async () => {
			mockService.execute.mockResolvedValue(err(new MemberNotFoundError()))
			const { req, ctx } = makeRequest("999999")
			const response = await GET(req, ctx)
			expect(response.status).toBe(404)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("not found this member id")
		})

		it("returns 500 on a DatabaseError (incl. missing-business corruption)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("no business row")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const { req, ctx } = makeRequest("101")
			const response = await GET(req, ctx)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
