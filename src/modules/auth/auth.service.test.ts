import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { AuthService } from "./auth.service"

// Mock the env configuration
vi.mock("src/shared/config/env", () => ({
	envConfig: {
		NODE_ENV: "test",
		ADMIN_PASSWORD: "Energetic9-Mulch2-Arknight6",
	},
}))

// Mock session cache
vi.mock("src/shared/lib/session-store", () => ({
	sessionCache: {
		set: vi.fn(),
	},
}))

describe("AuthService", () => {
	let authService: AuthService

	beforeEach(async () => {
		authService = new AuthService()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("login", () => {
		test("should return LoginResult with sessionId and username on successful login", async () => {
			const { sessionCache } = await import("src/shared/lib/session-store")
			const result = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result).not.toBeNull()
			expect(result).toHaveProperty("sessionId")
			expect(result).toHaveProperty("username")
			expect(result?.username).toBe("admin")
			expect(result?.sessionId).toBeDefined()
			expect(typeof result?.sessionId).toBe("string")
			expect(sessionCache.set).toHaveBeenCalledTimes(1)
			expect(sessionCache.set).toHaveBeenCalledWith(result?.sessionId, { username: "admin" })
		})

		test("should return null on invalid username", async () => {
			const { sessionCache } = await import("src/shared/lib/session-store")
			const result = await authService.login("wronguser", "Energetic9-Mulch2-Arknight6")

			expect(result).toBeNull()
			expect(sessionCache.set).not.toHaveBeenCalled()
		})

		test("should return null on invalid password", async () => {
			const { sessionCache } = await import("src/shared/lib/session-store")
			const result = await authService.login("admin", "wrong-password")

			expect(result).toBeNull()
			expect(sessionCache.set).not.toHaveBeenCalled()
		})

		test("should return null on both invalid username and password", async () => {
			const { sessionCache } = await import("src/shared/lib/session-store")
			const result = await authService.login("wronguser", "wrong-password")

			expect(result).toBeNull()
			expect(sessionCache.set).not.toHaveBeenCalled()
		})

		test("should create unique sessionIds for multiple successful logins", async () => {
			const { sessionCache } = await import("src/shared/lib/session-store")
			const result1 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")
			const result2 = await authService.login("admin", "Energetic9-Mulch2-Arknight6")

			expect(result1).not.toBeNull()
			expect(result2).not.toBeNull()
			expect(result1?.sessionId).not.toBe(result2?.sessionId)
			expect(sessionCache.set).toHaveBeenCalledTimes(2)
		})
	})
})
