import type { SessionData } from "./types"

/**
 * Interface for session storage operations
 */
export interface ISessionStore {
	set(sessionId: string, data: SessionData): Promise<void> | void
	get(sessionId: string): Promise<SessionData | null> | SessionData | null
	delete(sessionId: string): Promise<boolean> | boolean
}

/**
 * Interface for generating unique identifiers
 */
export interface IIdGenerator {
	generate(): string
}

/**
 * Interface for environment configuration
 */
export interface IAuthConfig {
	readonly ADMIN_PASSWORD: string
}
