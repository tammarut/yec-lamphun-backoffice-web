import { describe, expect, test, vi, beforeEach } from "vitest"
import { AuthService } from "./auth.service"
import type { IAuthConfig, IIdGenerator, ISessionStore } from "./interfaces"

describe("AuthService", () => {
	let authService: AuthService
	let mockConfig: IAuthConfig
	let mockSessionStore: ISessionStore
	let mockIdGenerator: IIdGenerator
	let mockSessionId: string

	beforeEach(() => {
		// Setup mocks
		mockSessionId = "test-session-id-123"

		mockConfig = {
			ADMIN_PASSWORD: "Energetic9-Mulch2-Arknight6",
		}

		mockSessionStore = {
			set: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
		}

		mockIdGenerator = {
			generate: vi.fn().mockReturnValue(mockSessionId),
		}

		authService = new AuthService(mockConfig, mockSessionStore, mockIdGenerator)
	})

	describe("login", () => {
		test("should return LoginResult with sessionId and username on successful login", async () => {
			const result = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result).not.toBeNull()
			expect(result).toHaveProperty("sessionId")
			expect(result).toHaveProperty("username")
			expect(result?.username).toBe("admin")
			expect(result?.sessionId).toBe(mockSessionId)
			expect(mockIdGenerator.generate).toHaveBeenCalledTimes(1)
			expect(mockSessionStore.set).toHaveBeenCalledTimes(1)
			expect(mockSessionStore.set).toHaveBeenCalledWith(mockSessionId, { username: "admin" })
		})

		test("should return null on invalid username", async () => {
			const result = await authService.login("wronguser", "Energetic9-Mulch2-Arknight6")

			expect(result).toBeNull()
			expect(mockIdGenerator.generate).not.toHaveBeenCalled()
			expect(mockSessionStore.set).not.toHaveBeenCalled()
		})

		test("should return null on invalid password", async () => {
			const result = await authService.login("admin", "wrong-password")

			expect(result).toBeNull()
			expect(mockIdGenerator.generate).not.toHaveBeenCalled()
			expect(mockSessionStore.set).not.toHaveBeenCalled()
		})

		test("should return null on both invalid username and password", async () => {
			const result = await authService.login("wronguser", "wrong-password")

			expect(result).toBeNull()
			expect(mockIdGenerator.generate).not.toHaveBeenCalled()
			expect(mockSessionStore.set).not.toHaveBeenCalled()
		})

		test("should create unique sessionIds for multiple successful logins", async () => {
			// Mock different session IDs for each call
			;(mockIdGenerator.generate as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

			const result1 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")
			const result2 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result1).not.toBeNull()
			expect(result2).not.toBeNull()
			expect(result1?.sessionId).toBe("session-id-1")
			expect(result2?.sessionId).toBe("session-id-2")
			expect(result1?.sessionId).not.toBe(result2?.sessionId)
			expect(mockIdGenerator.generate).toHaveBeenCalledTimes(2)
			expect(mockSessionStore.set).toHaveBeenCalledTimes(2)
		})
	})
})
