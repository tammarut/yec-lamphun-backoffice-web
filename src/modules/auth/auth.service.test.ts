import type { EnvConfig } from "src/shared/config/env"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { AuthService } from "./auth.service"
import { InvalidCredentialsError } from "./errors"
import type { ISessionStore } from "./interfaces"

describe("AuthService", () => {
	let authService: AuthService
	let mockConfig: EnvConfig
	let mockSessionStore: MockProxy<ISessionStore>
	let mockSessionId: string

	beforeEach(() => {
		// Setup mocks
		mockSessionId = "test-session-id-123"

		mockConfig = {
			NODE_ENV: "test",
			ADMIN_USERNAME: "admin",
			ADMIN_PASSWORD: "Energetic9-Mulch2-Arknight6",
			DATABASE_URL: "postgres://mock:5432/db",
			DB_MAX_CONNECTIONS: 10,
			DB_IDLE_TIMEOUT: 30,
			DB_CONNECTION_TIMEOUT: 30,
			DB_MAX_LIFETIME: 3600,
		}

		mockSessionStore = mock<ISessionStore>()
		mockSessionStore.createSession.mockReturnValue(mockSessionId)

		authService = new AuthService(mockConfig, mockSessionStore)
	})

	describe("login", () => {
		describe("Happy cases", () => {
			test("should return Result with sessionId on successful login", () => {
				const result = authService.login("admin", "Energetic9-Mulch2-Arknight6")

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value).toBe(mockSessionId)
				}
				expect(mockSessionStore.createSession).toHaveBeenCalledTimes(1)
				expect(mockSessionStore.createSession).toHaveBeenCalledWith({ username: "admin" })
			})

			test("should create unique sessionIds for multiple successful logins", () => {
				// Mock different session IDs for each call
				mockSessionStore.createSession.mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

				const result1 = authService.login("admin", "Energetic9-Mulch2-Arknight6")
				const result2 = authService.login("admin", "Energetic9-Mulch2-Arknight6")

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

		describe("Unhappy cases", () => {
			test("should return error Result on invalid username", () => {
				const result = authService.login("wronguser", "Energetic9-Mulch2-Arknight6")

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(InvalidCredentialsError)
					expect(result.error.message).toBe("Invalid credentials")
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
			})

			test("should return error Result on invalid password", () => {
				const result = authService.login("admin", "wrong-password")

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(InvalidCredentialsError)
					expect(result.error.message).toBe("Invalid credentials")
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
			})

			test("should return error Result on both invalid username and password", () => {
				const result = authService.login("wronguser", "wrong-password")

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(InvalidCredentialsError)
					expect(result.error.message).toBe("Invalid credentials")
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
			})
		})
	})

	describe("logout", () => {
		describe("Happy cases", () => {
			test("should return Ok on successful logout", () => {
				mockSessionStore.delete.mockReturnValue(true)
				const result = authService.logout(mockSessionId)

				expect(result.isOk()).toBe(true)
				expect(mockSessionStore.delete).toHaveBeenCalledTimes(1)
				expect(mockSessionStore.delete).toHaveBeenCalledWith(mockSessionId)
			})

			test("should return Ok even if session does not exist (idempotent)", () => {
				mockSessionStore.delete.mockReturnValue(false)
				const result = authService.logout("invalid-session-id")

				expect(result.isOk()).toBe(true)
				expect(mockSessionStore.delete).toHaveBeenCalledTimes(1)
				expect(mockSessionStore.delete).toHaveBeenCalledWith("invalid-session-id")
			})
		})
	})
})
