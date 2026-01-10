import { describe, expect, test, beforeEach } from "vitest"
import { SessionStore } from "./session-store"
import type { SessionData } from "./session-store"

describe("SessionStore", () => {
	let sessionStore: SessionStore

	beforeEach(() => {
		sessionStore = new SessionStore(86400) // 1 day TTL
	})

	describe("createSession", () => {
		test("should create session and return sessionId", () => {
			const sessionData: SessionData = { username: "admin" }

			const sessionId = sessionStore.createSession(sessionData)

			expect(sessionId).toBeDefined()
			expect(typeof sessionId).toBe("string")
			expect(sessionId.length).toBeGreaterThan(0)

			// Verify session was stored
			const retrieved = sessionStore.get(sessionId)
			expect(retrieved).toEqual(sessionData)
		})

		test("should create unique session IDs", () => {
			const sessionData: SessionData = { username: "admin" }

			const sessionId1 = sessionStore.createSession(sessionData)
			const sessionId2 = sessionStore.createSession(sessionData)

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
			const sessionId1 = sessionStore.createSession({ username: "user1" })
			const sessionId2 = sessionStore.createSession({ username: "user2" })

			sessionStore.clear()

			expect(sessionStore.get(sessionId1)).toBeNull()
			expect(sessionStore.get(sessionId2)).toBeNull()
		})
	})
})
