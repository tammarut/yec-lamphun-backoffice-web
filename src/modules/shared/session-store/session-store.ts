import { NodeCache } from "@cacheable/node-cache"

export interface SessionData {
	username: string
}

/**
 * Interface for generating unique identifiers
 */
export interface IIdGenerator {
	generate(): string
}

/**
 * Session store class for managing user sessions
 */
export class SessionStore {
	private cache: NodeCache<SessionData>
	private readonly defaultTTL: number

	constructor(
		ttl: number,
		private readonly idGenerator: IIdGenerator
	) {
		this.defaultTTL = ttl
		this.cache = new NodeCache({
			stdTTL: ttl,
			checkperiod: 300, // Cleanup interval (5 minutes)
			useClones: false, // Better performance
			deleteOnExpire: true, // Auto-delete expired
			maxKeys: -1, // Unlimited sessions (memory only constraint)
		})
	}

	/**
	 * Create a new session and return the session ID
	 */
	createSession(data: SessionData): string {
		const sessionId = this.idGenerator.generate()
		this.cache.set(sessionId, data)
		return sessionId
	}

	/**
	 * Get a session by ID with sliding expiration
	 */
	get(sessionId: string): SessionData | null {
		const data = this.cache.get(sessionId)
		if (!data) {
			return null
		}
		// Update with sliding expiration
		this.cache.ttl(sessionId, this.defaultTTL)
		return data
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
