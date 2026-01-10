import { describe, expect, test, beforeEach, vi } from "vitest"
import { SessionStore } from "./session-store"
import type { SessionData } from "./session-store"
import type { IIdGenerator } from "src/modules/auth/interfaces"

describe("SessionStore", () => {
	let sessionStore: SessionStore
	let mockIdGenerator: IIdGenerator

	beforeEach(() => {
		mockIdGenerator = {
			generate: vi.fn().mockReturnValue("mock-session-id-123"),
		}
		sessionStore = new SessionStore(86400, mockIdGenerator) // 1 day TTL
	})

	describe("createSession", () => {
		test("should create session and return sessionId", () => {
			const sessionData: SessionData = { username: "admin" }

			const sessionId = sessionStore.createSession(sessionData)

			expect(sessionId).toBe("mock-session-id-123")
			expect(mockIdGenerator.generate).toHaveBeenCalledTimes(1)

			// Verify session was stored
			const retrieved = sessionStore.get(sessionId)
			expect(retrieved).toEqual(sessionData)
		})

		test("should create unique session IDs", () => {
			const sessionData: SessionData = { username: "admin" }

			// Mock different IDs for each call
			;(mockIdGenerator.generate as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-id-1").mockReturnValueOnce("session-id-2")

			const sessionId1 = sessionStore.createSession(sessionData)
			const sessionId2 = sessionStore.createSession(sessionData)

			expect(sessionId1).toBe("session-id-1")
			expect(sessionId2).toBe("session-id-2")
			expect(sessionId1).not.toBe(sessionId2)
		})
	})

	describe("get", () => {
		test("should retrieve session data", () => {
			const sessionData: SessionData = { username: "admin" }
			const sessionId = sessionStore.createSession(sessionData)

			const result = sessionStore.get(sessionId)

			expect(result).toEqual(sessionData)
		})

		test("should return null for non-existent session", () => {
			const result = sessionStore.get("non-existent-id")
			expect(result).toBeNull()
		})
	})

	describe("delete", () => {
		test("should delete existing session", () => {
			const sessionData: SessionData = { username: "admin" }
			const sessionId = sessionStore.createSession(sessionData)

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
			const sessionData: SessionData = { username: "admin" }
			const sessionId = sessionStore.createSession(sessionData)

			expect(sessionStore.has(sessionId)).toBe(true)
		})

		test("should return false for non-existent session", () => {
			expect(sessionStore.has("non-existent-id")).toBe(false)
		})
	})

	describe("clear", () => {
		test("should clear all sessions", () => {
			;(mockIdGenerator.generate as ReturnType<typeof vi.fn>).mockReturnValueOnce("session-1").mockReturnValueOnce("session-2")

			const sessionId1 = sessionStore.createSession({ username: "user1" })
			const sessionId2 = sessionStore.createSession({ username: "user2" })

			sessionStore.clear()

			expect(sessionStore.get(sessionId1)).toBeNull()
			expect(sessionStore.get(sessionId2)).toBeNull()
		})
	})
})
