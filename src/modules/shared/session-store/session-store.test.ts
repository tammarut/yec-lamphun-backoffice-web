import { describe, expect, test, beforeEach, vi } from "vitest"
import { SessionStore } from "./session-store"
import type { IIdGenerator } from "./session-store"
import type { SessionData } from "src/modules/auth/types"

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

	describe("has", () => {
		test("should return true for existing session", () => {
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

			expect(sessionStore.has(sessionId)).toBe(true)
		})

		test("should return false for non-existent session", () => {
			expect(sessionStore.has("non-existent-id")).toBe(false)
		})
	})

	describe("clear", () => {
		test("should clear all sessions", () => {
			;(mockIdGenerator.generate as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-1").mockReturnValueOnce("session-2")

			const sessionData1: SessionData = {
				username: "user1",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}
			const sessionData2: SessionData = {
				username: "user2",
				ip: null,
				userAgent: null,
				createdAt: new Date(),
				lastAccessedAt: new Date(),
				expiresAt: new Date(),
				isPersistent: false,
				ttlSeconds: 86400,
			}

			const sessionId1 = sessionStore.createSession(sessionData1, 86400)
			const sessionId2 = sessionStore.createSession(sessionData2, 86400)

			sessionStore.clear()

			expect(sessionStore.get(sessionId1)).toBeNull()
			expect(sessionStore.get(sessionId2)).toBeNull()
		})
	})
})
