import { err, errAsync, ok, okAsync, ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

// Mock container module BEFORE importing the route
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Mock the logger wrapper so route code's logger.error calls don't leak into
// test output, and so 500-path tests can assert the call happened. Matches the
// canonical route-test pattern. See docs/adr/0009.
const { loggerErrorSpy } = vi.hoisted(() => ({ loggerErrorSpy: vi.fn() }))
vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		error: loggerErrorSpy,
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import { AuthService } from "src/modules/auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { SystemSettingDomain } from "src/modules/system-settings/domain/system-setting.domain"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"

import { ResponseBodyError } from "src/app/api/shared/types"
// Import route AFTER mocks
import { GET, PATCH } from "./route"

describe("GET /api/v1/system-settings", () => {
	let mockService: ReturnType<typeof mock<SystemSettingsService>>

	beforeEach(() => {
		vi.clearAllMocks()
		// Create a mock service
		mockService = mock<SystemSettingsService>()
		// Configure container to return valid service mock
		// The generic type argument doesn't matter much for the spy but helps types
		vi.mocked(container.resolve).mockReturnValue(mockService)
	})

	it("should return 200 and transformed settings keys-values", async () => {
		const mockSettings: SystemSettingDomain[] = [
			{
				feature: "open_membership_renewal",
				value: true,
				description: "desc",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				feature: "maintenance_mode",
				value: false,
				description: "desc",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]

		// Use okAsync to create a ResultAsync logic, satisfying the return type
		mockService.getAllSettings.mockReturnValue(Promise.resolve(okAsync(mockSettings)) as unknown as Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>>)

		const response = await GET()

		expect(response).toBeInstanceOf(NextResponse)
		expect(response.status).toBe(200)

		const json = await response.json()
		expect(json).toEqual({
			open_membership_renewal: true,
			maintenance_mode: false,
		})
	})

	it("should return 500 when service returns error", async () => {
		mockService.getAllSettings.mockReturnValue(
			Promise.resolve(errAsync(new DatabaseError("DB Error"))) as unknown as Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>>
		)

		const response = await GET()

		expect(response.status).toBe(500)
		const json = await response.json()
		expect(json).toEqual({ error_message: "Internal Server Error" })
		// Infra failure is logged with structured detail (ADR-0009).
		expect(loggerErrorSpy).toHaveBeenCalledTimes(1)
		expect(loggerErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("system-settings fetch failed"),
			expect.objectContaining({ code: "DATABASE_ERROR", errorMessage: "DB Error" })
		)
	})
})

describe("PATCH /api/v1/system-settings", () => {
	let mockService: ReturnType<typeof mock<SystemSettingsService>>
	let mockAuthService: ReturnType<typeof mock<AuthService>>
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

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<SystemSettingsService>()
		mockAuthService = mock<AuthService>()

		// Configure container to return correct mock based on requested token
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === AuthService || token === REGISTER_KEY.AUTH_SERVICE) return mockAuthService
			if (token === SystemSettingsService || token === REGISTER_KEY.SYSTEM_SETTINGS_SERVICE) return mockService
			return {}
		})
	})

	describe("Happy cases", () => {
		it("should return 200 and updated settings when system settings update is successful", async () => {
			const mockUpdatedSettings: SystemSettingDomain[] = [
				{
					feature: "open_membership_renewal",
					value: true,
					description: "desc",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]
			mockService.updateSettings.mockReturnValue(
				Promise.resolve(okAsync(mockUpdatedSettings)) as unknown as Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>>
			)
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({ open_membership_renewal: true }),
			})
			request.cookies.set("session_id", "valid-session")

			const response = await PATCH(request, undefined)

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			const json = await response.json()
			expect(json).toEqual({ open_membership_renewal: true })
			expect(mockService.updateSettings).toHaveBeenCalledWith({ open_membership_renewal: true })
		})
	})

	describe("Unhappy cases", () => {
		it("should return 401 when session_id cookie is missing", async () => {
			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({ open_membership_renewal: true }),
			})
			// No cookie set

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("should return 401 when session is invalid", async () => {
			mockAuthService.validateSession.mockReturnValue(err(new Error("Unauthorized")))

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({ open_membership_renewal: true }),
			})
			request.cookies.set("session_id", "invalid-session")

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(401)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Unauthorized")
		})

		it("should return 400 when value is invalid type", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({ open_membership_renewal: "not-a-boolean" }),
			})
			request.cookies.set("session_id", "valid-session")

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe('Invalid type: Expected boolean but received "not-a-boolean"')
		})

		it("should return 400 when value is missing", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({}),
			})
			request.cookies.set("session_id", "valid-session")

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(400)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe('Invalid key: Expected "open_membership_renewal" but received undefined')
		})

		it("should return 400 when json payload is invalid", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: "invalid-json",
			})
			request.cookies.set("session_id", "valid-session")

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(400)
			const json = await response.json()
			expect(json).toEqual({
				error_message: "Invalid request body",
			})
		})

		it("should return 500 when service fails", async () => {
			mockAuthService.validateSession.mockReturnValue(ok(mockSessionData))
			mockService.updateSettings.mockReturnValue(
				Promise.resolve(errAsync(new DatabaseError("DB Error"))) as unknown as Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>>
			)

			const request = new NextRequest("http://localhost/api/v1/system-settings", {
				method: "PATCH",
				body: JSON.stringify({ open_membership_renewal: true }),
			})
			request.cookies.set("session_id", "valid-session")

			const response = await PATCH(request, undefined)

			expect(response.status).toBe(500)
			const json = await response.json()
			expect(json).toEqual({
				error_message: "Internal Server Error",
			})
			// Infra failure is logged with structured detail (ADR-0009).
			expect(loggerErrorSpy).toHaveBeenCalledTimes(1)
			expect(loggerErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("system-settings update failed"),
				expect.objectContaining({ code: "DATABASE_ERROR", errorMessage: "DB Error" })
			)
		})
	})
})
