// @vitest-environment node
import { err, ok, Result } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { AuthService } from "src/modules/auth"
import { MemberFileValidationError } from "src/modules/members/errors"
import { MemberFileService } from "src/modules/members/member-file.service"
import type { UploadedFilePathResponse } from "src/modules/members/member-file.types"
import { RATE_LIMIT_BUDGETS, RateLimiterService } from "src/modules/shared/rate-limiter/rate-limiter.service"
import { StorageError } from "src/modules/shared/storage"
import { TURNSTILE_TOKEN_HEADER } from "src/modules/shared/turnstile/constants"
import { TurnstileServiceError, TurnstileVerificationError } from "src/modules/shared/turnstile/errors"
import { TurnstileService } from "src/modules/shared/turnstile/turnstile.service"

import { ResponseBodyError } from "src/app/api/shared/types"
// Import route AFTER mocks.
import { POST } from "./route"

function makeImageFile(name: string, size = 1024): File {
	const blob = new Blob([new Uint8Array(size)], { type: "image/png" })
	return new File([blob], name, { type: "image/png" })
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
 * Build a multipart upload request. `turnstileToken` controls the SEC-5
 * `Yec-Turnstile-Token` request HEADER (ADR-0028 — the token is a credential,
 * never body data): default "tok_upload" = a guest carrying a token; null =
 * header omitted (the guest-missing-token and staff cases).
 */
function buildUploadRequest(fields: Record<string, File>, turnstileToken: string | null = "tok_upload", sessionCookie?: string): NextRequest {
	const form = new FormData()
	for (const [name, file] of Object.entries(fields)) {
		form.append(name, file)
	}
	// NextRequest accepts a BodyInit; FormData is a valid BodyInit. The explicit
	// Content-Length mirrors real clients (browsers/curl always send it for a
	// fully-serialized multipart body) — undici does not derive it from a
	// FormData body on the Request object, and the SEC-2 pre-parse guard needs
	// it to route past the 411 check.
	const headers: Record<string, string> = { "content-length": "10240" }
	if (turnstileToken !== null) {
		headers[TURNSTILE_TOKEN_HEADER] = turnstileToken
	}
	const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
		method: "POST",
		body: form,
		headers: headers,
	})
	if (sessionCookie !== undefined) {
		request.cookies.set("session_id", sessionCookie)
	}
	return request
}

describe("POST /api/v1/members/file/upload", () => {
	let mockService: ReturnType<typeof mock<MemberFileService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>
	let mockTurnstileService: ReturnType<typeof mock<TurnstileService>>
	let limiter: RateLimiterService

	beforeEach(() => {
		// Arrange (shared setup): guest path defaults. validateSession defaults to
		// INVALID (cookie, if any, behaves as not-admin) and the Turnstile verify
		// defaults to OK, unless a TC overrides either.
		vi.clearAllMocks()
		mockService = mock<MemberFileService>()
		mockAuthService = mock<AuthService>()
		mockTurnstileService = mock<TurnstileService>()
		mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))
		mockTurnstileService.verify.mockResolvedValue(ok({ verified: true }))
		limiter = new RateLimiterService(() => new Date())
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === MemberFileService || token === REGISTER_KEY.MEMBER_FILE_SERVICE) {
				return mockService
			}
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return { NODE_ENV: "test", ORIGIN_ALLOW_LIST: "", CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN: "" }
			}
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
				return limiter
			}
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.TURNSTILE_SERVICE) {
				return mockTurnstileService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with all six paths when a single file is uploaded", async () => {
			const expected: UploadedFilePathResponse = {
				id_card_image_file_path: null,
				company_certificate_file_path: null,
				profile_avatar_file_path: "members/profile_avatars/profile_avatar_ULID.png",
				business_logo_file_path: null,
				business_product_file_path: null,
				payment_slip_file_path: null,
			}
			mockService.uploadFiles.mockReturnValue(Promise.resolve(ok(expected)) as unknown as Promise<Result<UploadedFilePathResponse, never>>)

			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") })
			const response = await POST(request)

			expect(response.status).toBe(200)
			expect(response).toBeInstanceOf(NextResponse)
			const json = await response.json()
			expect(json).toEqual(expected)
			// The service should have received one MemberFileInput for profile_avatar.
			expect(mockService.uploadFiles).toHaveBeenCalledTimes(1)
			const passedInputs = mockService.uploadFiles.mock.calls[0]![0]
			expect(passedInputs).toHaveLength(1)
			expect(passedInputs[0]).toMatchObject({ field: "profile_avatar" })
		})

		it("ignores unknown form fields and only forwards the six known ones", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: null,
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)

			const request = buildUploadRequest({
				profile_avatar: makeImageFile("a.png"),
				not_a_real_field: makeImageFile("b.png"),
			})
			await POST(request)

			const passedInputs = mockService.uploadFiles.mock.calls[0]![0]
			expect(passedInputs).toHaveLength(1)
			expect(passedInputs[0]).toMatchObject({ field: "profile_avatar" })
		})

		it("still succeeds with NO Origin header (plain curl / Apidog unaffected — gate passes absent headers)", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: "members/profile_avatars/p.png",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)

			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") })
			const response = await POST(request)

			expect(response.status).toBe(200)
		})

		it("SEC-5: guest + valid token: the multipart token reaches siteverify, upload proceeds", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: "members/profile_avatars/p.png",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)

			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") }, "tok_upload")
			const response = await POST(request)

			expect(mockTurnstileService.verify).toHaveBeenCalledTimes(1)
			expect(mockTurnstileService.verify).toHaveBeenCalledWith("tok_upload", request.headers)
			expect(response.status).toBe(200)
		})

		it("SEC-5: ADMIN (valid cookie) + NO header: verification skipped — staff wizard uploads unaffected", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: "members/profile_avatars/p.png",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)

			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") }, null, "valid-session-id")
			const response = await POST(request)

			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
			expect(response.status).toBe(200)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 400 when no recognized files are provided", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(err(new MemberFileValidationError("At least one file must be provided."))) as unknown as Promise<
					Result<UploadedFilePathResponse, MemberFileValidationError>
				>
			)

			const request = buildUploadRequest({})
			const response = await POST(request)

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toContain("At least one file")
		})

		it("returns 400 when the service reports a validation error", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(err(new MemberFileValidationError("Invalid file type for 'id_card_image'. Only .jpg, .jpeg, .png, .webp are allowed."))) as unknown as Promise<
					Result<UploadedFilePathResponse, MemberFileValidationError>
				>
			)

			const request = buildUploadRequest({ id_card_image: makeImageFile("a.exe") })
			const response = await POST(request)

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toContain("Invalid file type")
		})

		it("returns 500 when the service reports a storage error", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(err(new StorageError("R2 PutObject failed"))) as unknown as Promise<Result<UploadedFilePathResponse, StorageError>>
			)
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") })
			const response = await POST(request)

			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})

		it("returns 400 when the form body cannot be parsed", async () => {
			// Send a JSON body to a multipart endpoint; request.formData() should reject.
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: JSON.stringify({ not: "multipart" }),
				headers: { "content-type": "application/json", "content-length": "20" },
			})

			const response = await POST(request)
			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Invalid request body")
		})

		it("returns 413 BEFORE parsing when Content-Length exceeds the ~47 MB body cap", async () => {
			// 6 files x 7 MB per-file cap + multipart overhead = 47 MiB
			// (49,283,072 bytes); one byte above the cap must never reach
			// request.formData(). The explicit header stands in for the oversized
			// client without streaming 47 MB.
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: "x",
				headers: { "content-length": "49283073" },
			})

			const response = await POST(request)

			expect(response.status).toBe(413)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Request body too large")
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 413 for a NEGATIVE Content-Length (scrutiny MAJOR-1: fail-closed on malformed headers)", async () => {
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: "x",
				headers: { "content-length": "-1" },
			})

			const response = await POST(request)

			expect(response.status).toBe(413)
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 413 for a NON-INTEGER Content-Length", async () => {
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: "x",
				headers: { "content-length": "12.5" },
			})

			const response = await POST(request)

			expect(response.status).toBe(413)
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 411 BEFORE parsing when Content-Length is missing (chunked body)", async () => {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode("multipart-bytes"))
				},
			})
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: stream,
				duplex: "half",
			})

			const response = await POST(request)

			expect(response.status).toBe(411)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Content-Length required")
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 403 when the Origin header is present but not allow-listed", async () => {
			const form = new FormData()
			form.append("profile_avatar", makeImageFile("a.png"))
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: form,
				headers: { origin: "https://evil.example.net" },
			})

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Forbidden")
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 403 via the Referer fallback when Origin is absent and Referer is foreign", async () => {
			const form = new FormData()
			form.append("profile_avatar", makeImageFile("a.png"))
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: form,
				headers: { referer: "https://evil.example.net/drive-by-form" },
			})

			const response = await POST(request)

			expect(response.status).toBe(403)
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("returns 429 with Retry-After once the UPLOAD_WRITE budget (10/10 min) exhausts", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: "members/profile_avatars/p.png",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)
			const budget = RATE_LIMIT_BUDGETS["UPLOAD_WRITE"]

			for (let i = 0; i < budget.limit; i += 1) {
				const underBudget = await POST(buildUploadRequest({ profile_avatar: makeImageFile("a.png") }))
				expect(underBudget.status).toBe(200)
			}
			const overBudget = await POST(buildUploadRequest({ profile_avatar: makeImageFile("a.png") }))

			expect(overBudget.status).toBe(429)
			const json = (await overBudget.json()) as ResponseBodyError
			expect(json.error_message).toBe("Too Many Requests")
			expect(overBudget.headers.get("Retry-After")).toBe(String(budget.windowMs / 1000))
		})

		it("SEC-5: guest + missing header: 403 'Human verification failed', no upload occurs", async () => {
			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") }, null)

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Human verification failed")
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("SEC-5 (header-only, ADR-0028): guest sending a body turnstile_token field WITHOUT the header → 403 — the body field is not honored", async () => {
			const form = new FormData()
			form.append("profile_avatar", makeImageFile("a.png"))
			form.append("turnstile_token", "tok_in_body")
			const request = new NextRequest("http://localhost/api/v1/members/file/upload", {
				method: "POST",
				body: form,
				headers: { "content-length": "10240" },
			})

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Human verification failed")
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("SEC-5 scrutiny MINOR-1: guest + whitespace-only header token: 403 without burning a siteverify round-trip", async () => {
			mockService.uploadFiles.mockReturnValue(
				Promise.resolve(
					ok({
						id_card_image_file_path: null,
						company_certificate_file_path: null,
						profile_avatar_file_path: "members/profile_avatars/p.png",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				) as unknown as Promise<Result<UploadedFilePathResponse, never>>
			)
			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") }, "   ")

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Human verification failed")
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("SEC-5: siteverify rejects the token (invalid/expired): 403, no upload occurs", async () => {
			mockTurnstileService.verify.mockResolvedValue(err(new TurnstileVerificationError()))
			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") })

			const response = await POST(request)

			expect(response.status).toBe(403)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Human verification failed")
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
		})

		it("SEC-5: siteverify unreachable (503 family): 503 'temporarily unavailable', no upload occurs", async () => {
			mockTurnstileService.verify.mockResolvedValue(err(new TurnstileServiceError("Human verification is temporarily unavailable")))
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const request = buildUploadRequest({ profile_avatar: makeImageFile("a.png") })

			const response = await POST(request)

			expect(response.status).toBe(503)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Human verification is temporarily unavailable")
			expect(mockService.uploadFiles).not.toHaveBeenCalled()
			consoleSpy.mockRestore()
		})
	})
})
