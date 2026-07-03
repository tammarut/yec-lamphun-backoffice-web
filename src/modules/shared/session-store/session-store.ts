import { NodeCache } from "@cacheable/node-cache"
import type { SessionData } from "src/modules/auth/types"

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
	private readonly cache: NodeCache<SessionData>
	private readonly idGenerator: IIdGenerator

	constructor(idGenerator: IIdGenerator) {
		this.idGenerator = idGenerator
		this.cache = new NodeCache({
			checkperiod: 300, // Cleanup interval (5 minutes)
			useClones: false, // Better performance
			deleteOnExpire: true, // Auto-delete expired
			maxKeys: -1, // Unlimited sessions (memory only constraint)
		})
	}

	/**
	 * Create a new session and return the session ID
	 */
	createSession(data: SessionData, ttl: number): string {
		const sessionId = this.idGenerator.generate()
		this.cache.set(sessionId, data, ttl)
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
		const ttl = data.ttlSeconds
		const now = new Date()
		const updatedData: SessionData = {
			...data,
			lastAccessedAt: now,
			expiresAt: new Date(now.getTime() + ttl * 1000),
		}
		this.cache.set(sessionId, updatedData, ttl)
		return updatedData
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
