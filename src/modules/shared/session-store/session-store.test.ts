import type { SessionData } from "src/modules/auth/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { IIdGenerator } from "./session-store"
import { SessionStore } from "./session-store"

describe("SessionStore", () => {
	let sessionStore: SessionStore
	let mockIdGenerator: IIdGenerator

	beforeEach(() => {
		mockIdGenerator = {
			generate: vi.fn().mockReturnValue("mock-session-id-123"),
		}
		sessionStore = new SessionStore(mockIdGenerator)
	})

	describe("createSession", () => {
		test("should create session and return sessionId", () => {
			const sessionData: SessionData = {
				username: "admin",
				ip: "127.0.0.1",
				userAgent: "Mozilla/5.0",
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}

			const sessionId = sessionStore.createSession(sessionData, 86400)

			expect(sessionId).toBe("mock-session-id-123")
			expect(mockIdGenerator.generate).toHaveBeenCalledTimes(1)

			// Verify session was stored
			const retrieved = sessionStore.get(sessionId)
			expect(retrieved?.username).toBe(sessionData.username)
			expect(retrieved?.ip).toBe(sessionData.ip)
			expect(retrieved?.isPersistent).toBe(sessionData.isPersistent)
		})

		test("should create unique session IDs", () => {
			const sessionData: SessionData = {
				username: "admin",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}

			// Mock different IDs for each call
			;(mockIdGenerator.generate as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

			const sessionId1 = sessionStore.createSession(sessionData, 86400)
			const sessionId2 = sessionStore.createSession(sessionData, 86400)

			expect(sessionId1).toBe("session-id-1")
			expect(sessionId2).toBe("session-id-2")
			expect(sessionId1).not.toBe(sessionId2)
		})
	})

	describe("get", () => {
		test("should retrieve session data and update sliding expiration", () => {
			const sessionData: SessionData = {
				username: "admin",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}
			const sessionId = sessionStore.createSession(sessionData, 86400)

			const result = sessionStore.get(sessionId)

			expect(result).toBeDefined()
			expect(result?.username).toBe(sessionData.username)
			// verify that lastAccessedAt is updated to now
			expect(result?.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(sessionData.lastAccessedAt.getTime())
		})

		test("should respect and update sliding expiration using stored ttlSeconds", () => {
			const sessionData: SessionData = {
				username: "admin",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 600, // 10 minutes custom TTL
			}
			const sessionId = sessionStore.createSession(sessionData, 600)

			const result = sessionStore.get(sessionId)

			expect(result).toBeDefined()
			const expectedExpiryTime = new Date().getTime() + 600 * 1000
			expect(result?.expiresAt.getTime()).toBeCloseTo(expectedExpiryTime, -3)
		})

		test("should return null for non-existent session", () => {
			const result = sessionStore.get("non-existent-id")
			expect(result).toBeNull()
		})
	})

	describe("delete", () => {
		test("should delete existing session", () => {
			const sessionData: SessionData = {
				username: "admin",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}
			const sessionId = sessionStore.createSession(sessionData, 86400)

			const deleted = sessionStore.delete(sessionId)

			expect(deleted).toBe(true)
			expect(sessionStore.get(sessionId)).toBeNull()
		})

		test("should return false when deleting non-existent session", () => {
			const deleted = sessionStore.delete("non-existent-id")
			expect(deleted).toBe(false)
		})
	})
})
