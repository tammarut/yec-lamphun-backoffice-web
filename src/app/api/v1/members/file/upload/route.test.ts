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
import { MemberFileValidationError } from "src/modules/members/errors"
import { MemberFileService } from "src/modules/members/member-file.service"
import type { UploadedFilePathResponse } from "src/modules/members/member-file.types"
import { RATE_LIMIT_BUDGETS, RateLimiterService } from "src/modules/shared/rate-limiter/rate-limiter.service"
import { StorageError } from "src/modules/shared/storage"

import { ResponseBodyError } from "src/app/api/shared/types"
// Import route AFTER mocks.
import { POST } from "./route"

function makeImageFile(name: string, size = 1024): File {
	const blob = new Blob([new Uint8Array(size)], { type: "image/png" })
	return new File([blob], name, { type: "image/png" })
}

function buildUploadRequest(fields: Record<string, File>): NextRequest {
	const form = new FormData()
	for (const [name, file] of Object.entries(fields)) {
		form.append(name, file)
	}
	// NextRequest accepts a BodyInit; FormData is a valid BodyInit. The explicit
	// Content-Length mirrors real clients (browsers/curl always send it for a
	// fully-serialized multipart body) — undici does not derive it from a
	// FormData body on the Request object, and the SEC-2 pre-parse guard needs
	// it to route past the 411 check.
	return new NextRequest("http://localhost/api/v1/members/file/upload", {
		method: "POST",
		body: form,
		headers: { "content-length": "10240" },
	})
}

describe("POST /api/v1/members/file/upload", () => {
	let mockService: ReturnType<typeof mock<MemberFileService>>
	let limiter: RateLimiterService

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<MemberFileService>()
		limiter = new RateLimiterService(() => new Date())
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === MemberFileService || token === REGISTER_KEY.MEMBER_FILE_SERVICE) {
				return mockService
			}
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return { NODE_ENV: "test", ORIGIN_ALLOW_LIST: "" }
			}
			if (token === REGISTER_KEY.RATE_LIMITER_SERVICE) {
				return limiter
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
	})
})
