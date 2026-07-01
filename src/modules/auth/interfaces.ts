import type { SessionData } from "./types"

/**
 * Interface for session storage operations
 */
export interface ISessionStore {
	createSession(data: SessionData, ttl: number): string
	get(sessionId: string): SessionData | null
	delete(sessionId: string): boolean
}
