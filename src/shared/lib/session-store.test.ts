import { describe, expect, test, beforeEach } from "vitest"
import { SessionStore } from "./session-store"
import type { SessionData } from "./session-store"

describe("SessionStore", () => {
	let sessionStore: SessionStore

	beforeEach(() => {
		sessionStore = new SessionStore()
	})

	describe("set and get", () => {
		test("should store and retrieve session data", () => {
			const sessionId = "test-session-123"
			const sessionData: SessionData = { username: "admin" }

			sessionStore.set(sessionId, sessionData)
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
			const sessionId = "test-session-123"
			const sessionData: SessionData = { username: "admin" }

			sessionStore.set(sessionId, sessionData)
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
			const sessionId = "test-session-123"
			const sessionData: SessionData = { username: "admin" }

			sessionStore.set(sessionId, sessionData)
			expect(sessionStore.has(sessionId)).toBe(true)
		})

		test("should return false for non-existent session", () => {
			expect(sessionStore.has("non-existent-id")).toBe(false)
		})
	})

	describe("clear", () => {
		test("should clear all sessions", () => {
			sessionStore.set("session-1", { username: "user1" })
			sessionStore.set("session-2", { username: "user2" })

			sessionStore.clear()

			expect(sessionStore.get("session-1")).toBeNull()
			expect(sessionStore.get("session-2")).toBeNull()
		})
	})
})
