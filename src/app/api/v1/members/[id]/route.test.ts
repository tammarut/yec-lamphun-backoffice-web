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
import { DeleteMemberService } from "src/modules/members/use-case/delete-member/delete-member.service"
import { MemberNotFoundError } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.errors"
import { GetMemberByIdService } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.service"
import type { MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { UpdateMemberService } from "src/modules/members/use-case/update-member/update-member.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { DELETE, GET, PATCH } from "./route"

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

/** Build a PATCH NextRequest with a JSON body + valid session cookie. */
function makePatchRequest(id: string, body: unknown): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
	const req = new NextRequest(`http://localhost/api/v1/members/${id}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	})
	req.cookies.set("session_id", "valid-session")
	return { req, ctx: { params: Promise.resolve({ id }) } }
}

/** Build a bodyless DELETE NextRequest with a valid session cookie. */
function makeDeleteRequest(id: string): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
	const req = new NextRequest(`http://localhost/api/v1/members/${id}`, { method: "DELETE" })
	req.cookies.set("session_id", "valid-session")
	return { req, ctx: { params: Promise.resolve({ id }) } }
}

/** A structurally valid PATCH body (all required fields, valid enums/formats). */
const validPatchBody = {
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

describe("PATCH /api/v1/members/:id", () => {
	let mockUpdateService: ReturnType<typeof mock<UpdateMemberService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockUpdateService = mock<UpdateMemberService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.UPDATE_MEMBER_SERVICE) return mockUpdateService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 204 with no body on a successful update", async () => {
			mockUpdateService.execute.mockResolvedValue(ok(undefined))
			const { req, ctx } = makePatchRequest("101", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(204)
			expect(await response.text()).toBe("")
			// The service receives the parsed integer id + the DTO.
			expect(mockUpdateService.execute).toHaveBeenCalledWith(101, expect.objectContaining({ registrationType: "INDIVIDUAL" }))
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/members/101", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(validPatchBody),
			})
			const response = await PATCH(req, { params: Promise.resolve({ id: "101" }) })
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 400 when id is not a valid integer", async () => {
			const { req, ctx } = makePatchRequest("abc", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
		})

		it("returns 400 when the body is not valid JSON", async () => {
			const req = new NextRequest("http://localhost/api/v1/members/101", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: "{not json",
			})
			req.cookies.set("session_id", "valid-session")
			const response = await PATCH(req, { params: Promise.resolve({ id: "101" }) })
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 400 when a required field is missing", async () => {
			const { req, ctx } = makePatchRequest("101", { ...validPatchBody, first_name_th: undefined })
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(400)
		})

		it("returns 404 when the member is not found", async () => {
			mockUpdateService.execute.mockResolvedValue(err(new MemberNotFoundError()))
			const { req, ctx } = makePatchRequest("999", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(404)
		})

		it("returns 409 on a duplicate-id_card conflict", async () => {
			mockUpdateService.execute.mockResolvedValue(err(new MemberConflictError("DUPLICATE_ID_CARD", "dup")))
			const { req, ctx } = makePatchRequest("101", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(409)
		})

		it("returns 409 on a position-occupied conflict", async () => {
			mockUpdateService.execute.mockResolvedValue(err(new MemberConflictError("POSITION_OCCUPIED", "occupied")))
			const { req, ctx } = makePatchRequest("101", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(409)
		})

		it("returns 400 on a MemberValidationError", async () => {
			mockUpdateService.execute.mockResolvedValue(err(new MemberValidationError("bad expiry")))
			const { req, ctx } = makePatchRequest("101", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(400)
		})

		it("returns 500 on a DatabaseError", async () => {
			mockUpdateService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const { req, ctx } = makePatchRequest("101", validPatchBody)
			const response = await PATCH(req, ctx)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
		})
	})
})

describe("DELETE /api/v1/members/:id", () => {
	let mockDeleteService: ReturnType<typeof mock<DeleteMemberService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockDeleteService = mock<DeleteMemberService>()
		mockAuthService = mock<AuthService>()
		mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === REGISTER_KEY.DELETE_MEMBER_SERVICE) return mockDeleteService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 204 with no body on a successful delete", async () => {
			mockDeleteService.execute.mockResolvedValue(ok(undefined))
			const { req, ctx } = makeDeleteRequest("101")
			const response = await DELETE(req, ctx)
			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(204)
			expect(await response.text()).toBe("")
			// The service receives the parsed integer id only (no body/DTO).
			expect(mockDeleteService.execute).toHaveBeenCalledWith(101)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 401 when session_id cookie is missing", async () => {
			const req = new NextRequest("http://localhost/api/v1/members/101", { method: "DELETE" })
			const response = await DELETE(req, { params: Promise.resolve({ id: "101" }) })
			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("returns 400 when id is not a valid integer", async () => {
			const { req, ctx } = makeDeleteRequest("abc")
			const response = await DELETE(req, ctx)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("id parameter must be a valid integer")
		})

		it("returns 500 on a DatabaseError (no 404 path — idempotent)", async () => {
			mockDeleteService.execute.mockResolvedValue(err(new DatabaseError("tx failed")))
			const { req, ctx } = makeDeleteRequest("101")
			const response = await DELETE(req, ctx)
			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
		})
	})
})
