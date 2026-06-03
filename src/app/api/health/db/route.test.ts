import { NextResponse } from "next/server"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { mock } from "vitest-mock-extended"
import { ok, err } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock env + container modules BEFORE importing the route (route imports env for side effects)
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_USERNAME: "admin",
		ADMIN_PASSWORD: "password",
		DATABASE_URL: "postgres://mock:5432/db",
		DB_MAX_CONNECTIONS: 10,
		DB_IDLE_TIMEOUT: 30,
		DB_CONNECTION_TIMEOUT: 30,
		DB_MAX_LIFETIME: 3600,
	},
}))

vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

import { container } from "src/modules/container"
import { HealthService } from "src/modules/health/health.service"

// Import route AFTER mocks
import { GET } from "./route"

describe("GET /api/health/db", () => {
	let mockService: ReturnType<typeof mock<HealthService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<HealthService>()
		vi.mocked(container.resolve).mockReturnValue(mockService)
	})

	it("should return 200 and db time on success", async () => {
		const dbTime = new Date("2024-01-01T00:00:00Z")
		mockService.checkHealth.mockReturnValue(
			Promise.resolve(ok({ status: "ok", dbTime }))
		)

		const response = await GET()

		expect(response).toBeInstanceOf(NextResponse)
		expect(response.status).toBe(200)

		const json = await response.json()
		expect(json).toEqual({
			status: "ok",
			dbTime: "2024-01-01T00:00:00.000Z",
		})
	})

	it("should return 500 and error details on failure", async () => {
		mockService.checkHealth.mockReturnValue(
			Promise.resolve(err(new DatabaseError("Failed to connect")))
		)

		const response = await GET()

		expect(response.status).toBe(500)
		const json = await response.json()
		expect(json).toEqual({
			status: "error",
			message: "Failed to connect",
			code: "DATABASE_ERROR",
		})
	})
})
