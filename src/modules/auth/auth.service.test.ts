import { describe, expect, test, vi, beforeEach } from "vitest"
import { AuthService } from "./auth.service"
import type { EnvConfig } from "src/shared/config/env"
import type { ISessionStore } from "./interfaces"

describe("AuthService", () => {
	let authService: AuthService
	let mockConfig: EnvConfig
	let mockSessionStore: ISessionStore
	let mockSessionId: string

	beforeEach(() => {
		// Setup mocks
		mockSessionId = "test-session-id-123"

		mockConfig = {
			NODE_ENV: "test",
			ADMIN_PASSWORD: "Energetic9-Mulch2-Arknight6",
		}

		mockSessionStore = {
			createSession: vi.fn().mockReturnValue(mockSessionId),
			get: vi.fn(),
			delete: vi.fn(),
		}

		authService = new AuthService(mockConfig, mockSessionStore)
	})

	describe("login", () => {
		test("should return Result with sessionId on successful login", async () => {
			const result = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result.isOk()).toBe(true)
			if (result.isOk()) {
				expect(result.value).toBe(mockSessionId)
			}
			expect(mockSessionStore.createSession).toHaveBeenCalledTimes(1)
			expect(mockSessionStore.createSession).toHaveBeenCalledWith({ username: "admin" })
		})

		test("should return error Result on invalid username", async () => {
			const result = await authService.login("wronguser", "Energetic9-Mulch2-Arknight6")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBe("Invalid credentials")
			}
			expect(mockSessionStore.createSession).not.toHaveBeenCalled()
		})

		test("should return error Result on invalid password", async () => {
			const result = await authService.login("admin", "wrong-password")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBe("Invalid credentials")
			}
			expect(mockSessionStore.createSession).not.toHaveBeenCalled()
		})

		test("should return error Result on both invalid username and password", async () => {
			const result = await authService.login("wronguser", "wrong-password")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBe("Invalid credentials")
			}
			expect(mockSessionStore.createSession).not.toHaveBeenCalled()
		})

		test("should create unique sessionIds for multiple successful logins", async () => {
			// Mock different session IDs for each call
			;(mockSessionStore.createSession as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

			const result1 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")
			const result2 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result1.isOk()).toBe(true)
			expect(result2.isOk()).toBe(true)
			if (result1.isOk() && result2.isOk()) {
				expect(result1.value).toBe("session-id-1")
				expect(result2.value).toBe("session-id-2")
				expect(result1.value).not.toBe(result2.value)
			}
			expect(mockSessionStore.createSession).toHaveBeenCalledTimes(2)
		})
	})
})
