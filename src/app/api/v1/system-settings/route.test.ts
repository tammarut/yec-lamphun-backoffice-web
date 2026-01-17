import { errAsync, okAsync, ResultAsync } from "neverthrow"
import { NextResponse } from "next/server"
import "reflect-metadata"
import { container } from "src/modules/container"
import { SystemSettingDomain } from "src/modules/system-settings/domain/system-setting.domain"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"
import { GET } from "./route"

// Mock the container module
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

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

		// Suppress console.error for this test
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const response = await GET()

		expect(response.status).toBe(500)
		const json = await response.json()
		expect(json).toEqual({ message: "Internal Server Error" })

		consoleSpy.mockRestore()
	})
})
