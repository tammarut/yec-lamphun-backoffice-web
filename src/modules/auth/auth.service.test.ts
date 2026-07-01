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
				const result = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.sessionId).toBe(mockSessionId)
					expect(result.value.ttlSeconds).toBe(86400)
				}
				expect(mockSessionStore.createSession).toHaveBeenCalledTimes(1)
				expect(mockSessionStore.createSession).toHaveBeenCalledWith(
					expect.objectContaining({
						username: "admin",
						isPersistent: false,
					}),
					86400
				)
			})

			test("should create unique sessionIds for multiple successful logins", () => {
				// Mock different session IDs for each call
				mockSessionStore.createSession.mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

				const result1 = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})
				const result2 = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result1.isOk()).toBe(true)
				expect(result2.isOk()).toBe(true)
				if (result1.isOk() && result2.isOk()) {
					expect(result1.value.sessionId).toBe("session-id-1")
					expect(result2.value.sessionId).toBe("session-id-2")
					expect(result1.value.sessionId).not.toBe(result2.value.sessionId)
				}
				expect(mockSessionStore.createSession).toHaveBeenCalledTimes(2)
			})

			test("should handle rememberMe = true and return 30-day TTL", () => {
				const result = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: true,
					ip: "127.0.0.1",
					userAgent: "Mozilla/5.0",
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.sessionId).toBe(mockSessionId)
					expect(result.value.ttlSeconds).toBe(30 * 24 * 60 * 60)
				}
				expect(mockSessionStore.createSession).toHaveBeenCalledWith(
					expect.objectContaining({
						username: "admin",
						ip: "127.0.0.1",
						userAgent: "Mozilla/5.0",
						isPersistent: true,
					}),
					30 * 24 * 60 * 60
				)
			})

			test("should sanitize username input", () => {
				const result = authService.login({
					username: " <admin> ",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.sessionId).toBe(mockSessionId)
				}
				expect(mockSessionStore.createSession).toHaveBeenCalledWith(
					expect.objectContaining({
						username: "admin",
					}),
					expect.any(Number)
				)
			})
		})

		describe("Unhappy cases", () => {
			test("should return error Result on invalid username", () => {
				const result = authService.login({
					username: "wronguser",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(InvalidCredentialsError)
					expect(result.error.message).toBe("Invalid credentials")
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
			})

			test("should return error Result on invalid password", () => {
				const result = authService.login({
					username: "admin",
					password: "wrong-password",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(InvalidCredentialsError)
					expect(result.error.message).toBe("Invalid credentials")
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
			})

			test("should return error Result on both invalid username and password", () => {
				const result = authService.login({
					username: "wronguser",
					password: "wrong-password",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

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

	describe("validateSession", () => {
		describe("Happy cases", () => {
			test("should return ok with session data when session is valid", () => {
				const sessionData = {
					username: "admin",
					ip: "127.0.0.1",
					userAgent: "Mozilla/5.0",
					createdAt: new Date(),
					lastAccessedAt: new Date(),
					expiresAt: new Date(),
					isPersistent: false,
				}
				mockSessionStore.get.mockReturnValue(sessionData)

				const result = authService.validateSession("valid-session-id")

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value).toEqual(sessionData)
				}
				expect(mockSessionStore.get).toHaveBeenCalledWith("valid-session-id")
			})
		})

		describe("Unhappy cases", () => {
			test("should return err when session is invalid or expired", () => {
				mockSessionStore.get.mockReturnValue(null)

				const result = authService.validateSession("invalid-session-id")

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(Error)
					expect(result.error.message).toBe("Unauthorized")
				}
				expect(mockSessionStore.get).toHaveBeenCalledWith("invalid-session-id")
			})
		})
	})
})
