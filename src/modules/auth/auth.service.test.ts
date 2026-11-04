import { err, ok } from "neverthrow"
import type { EnvConfig } from "src/shared/config/env"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { RateLimitExceededError } from "src/modules/shared/rate-limiter/rate-limiter.service"
import { AuthService } from "./auth.service"
import { InvalidCredentialsError } from "./errors"
import type { ISessionStore } from "./interfaces"
import { LoginFailureLockoutService } from "./login-failure-lockout.service"

describe("AuthService", () => {
	let authService: AuthService
	let mockConfig: EnvConfig
	let mockSessionStore: MockProxy<ISessionStore>
	let mockLoginLockout: MockProxy<LoginFailureLockoutService>
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
			R2_ACCOUNT_ID: "test-account",
			R2_ACCESS_KEY_ID: "test-key",
			R2_SECRET_ACCESS_KEY: "test-secret",
			R2_PUBLIC_BUCKET: "yec-lamphun-public",
			R2_PRIVATE_BUCKET: "yec-lamphun-private",
			R2_PUBLIC_BASE_URL: "https://test.r2.cloudflarestorage.com/public",
			PRESIGNED_URL_EXPIRES_IN: 3600,
			ID_CARD_AES_KEY: "x".repeat(44),
			BLIND_INDEX_HMAC_KEY: "y".repeat(44),
			CLOUDFLARE_CIDRS: "",
			ORIGIN_ALLOW_LIST: "",
		}

		mockSessionStore = mock<ISessionStore>()
		mockSessionStore.createSession.mockReturnValue(mockSessionId)

		mockLoginLockout = mock<LoginFailureLockoutService>()
		mockLoginLockout.checkLock.mockReturnValue(ok({ allowed: true }))

		authService = new AuthService(mockConfig, mockSessionStore, mockLoginLockout)
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
						ttlSeconds: 86400,
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
						ttlSeconds: 30 * 24 * 60 * 60,
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

			test("should reset the pair's lockout streak on successful login (SEC-3)", () => {
				const result = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: "10.0.0.5",
					userAgent: null,
				})

				expect(result.isOk()).toBe(true)
				expect(mockLoginLockout.checkLock).toHaveBeenCalledWith("10.0.0.5:admin")
				expect(mockLoginLockout.recordFailure).not.toHaveBeenCalled()
				expect(mockLoginLockout.reset).toHaveBeenCalledWith("10.0.0.5:admin")
			})

			test("should gate BEFORE the credential compare when the pair is locked — correct password still rejected (SEC-3)", () => {
				// The locked pair rejects; the compare must never run.
				const locked = new RateLimitExceededError("Too Many Requests", 900)
				mockLoginLockout.checkLock.mockReturnValue(err(locked))

				const result = authService.login({
					username: "admin",
					password: "Energetic9-Mulch2-Arknight6",
					rememberMe: false,
					ip: "10.0.0.5",
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(locked)
				}
				expect(mockSessionStore.createSession).not.toHaveBeenCalled()
				expect(mockLoginLockout.recordFailure).not.toHaveBeenCalled()
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

			test("should record the failure keyed ip:sanitized-username on invalid password (SEC-3)", () => {
				// Junk characters in the username sanitize to "admin" — the pair
				// key must land on the sanitized form so padding can't split keys.
				const result = authService.login({
					username: " <admin> ",
					password: "wrong-password",
					rememberMe: false,
					ip: "10.0.0.5",
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				expect(mockLoginLockout.recordFailure).toHaveBeenCalledWith("10.0.0.5:admin")
				expect(mockLoginLockout.reset).not.toHaveBeenCalled()
			})

			test("should key the failure under unknown when no client ip is present (SEC-3)", () => {
				const result = authService.login({
					username: "admin",
					password: "wrong-password",
					rememberMe: false,
					ip: null,
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				expect(mockLoginLockout.recordFailure).toHaveBeenCalledWith("unknown:admin")
			})

			test("should record the failure for an unknown username too (SEC-3)", () => {
				const result = authService.login({
					username: "wronguser",
					password: "wrong-password",
					rememberMe: false,
					ip: "10.0.0.5",
					userAgent: null,
				})

				expect(result.isErr()).toBe(true)
				expect(mockLoginLockout.recordFailure).toHaveBeenCalledWith("10.0.0.5:wronguser")
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
					ttlSeconds: 86400,
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
					expect(result.error.message).toBe("Not Found session")
				}
				expect(mockSessionStore.get).toHaveBeenCalledWith("invalid-session-id")
			})
		})
	})
})
