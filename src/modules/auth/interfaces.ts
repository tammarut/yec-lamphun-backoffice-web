import type { SessionData } from "./types"

/**
 * Interface for session storage operations
 */
export interface ISessionStore {
	createSession(data: SessionData): Promise<string> | string
	get(sessionId: string): Promise<SessionData | null> | SessionData | null
	delete(sessionId: string): Promise<boolean> | boolean
}

/**
 * Interface for generating unique identifiers
 */
export interface IIdGenerator {
	generate(): string
}
