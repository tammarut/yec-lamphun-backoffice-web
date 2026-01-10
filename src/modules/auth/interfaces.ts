import type { SessionData } from "./types"

/**
 * Interface for session storage operations
 */
export interface ISessionStore {
	createSession(data: SessionData): string
	get(sessionId: string): SessionData | null
	delete(sessionId: string): boolean
}

/**
 * Interface for generating unique identifiers
 */
export interface IIdGenerator {
	generate(): string
}
