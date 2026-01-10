import { NodeCache } from "@cacheable/node-cache"

export interface SessionData {
	username: string
}

/**
 * Session store class for managing user sessions
 */
export class SessionStore {
	private cache: NodeCache<SessionData>
	private readonly defaultTTL: number

	constructor(ttl: number = 86400) {
		// TTL 1 day (86400 seconds) by default
		this.defaultTTL = ttl
		this.cache = new NodeCache({ stdTTL: this.defaultTTL })
	}

	/**
	 * Store a session
	 */
	set(sessionId: string, data: SessionData): void {
		this.cache.set(sessionId, data)
	}

	/**
	 * Get a session by ID
	 */
	get(sessionId: string): SessionData | null {
		const data = this.cache.get(sessionId)
		return data !== undefined ? data : null
	}

	/**
	 * Delete a session
	 */
	delete(sessionId: string): boolean {
		const deleted = this.cache.del(sessionId)
		return deleted > 0
	}

	/**
	 * Check if session exists
	 */
	has(sessionId: string): boolean {
		return this.cache.has(sessionId)
	}

	/**
	 * Clear all sessions
	 */
	clear(): void {
		this.cache.flushAll()
	}
}

// Export singleton instance for backward compatibility
export const sessionCache = new SessionStore()
