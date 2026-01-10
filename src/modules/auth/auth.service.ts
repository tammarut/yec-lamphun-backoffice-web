import { ulid } from "ulid"
import { envConfig } from "src/shared/config/env"
import { sessionCache } from "src/shared/lib/session-store"
import type { LoginResult, SessionData } from "./types"

export class AuthService {
	/**
	 * Authenticate user with username and password
	 * @param username - The username to authenticate
	 * @param password - The password to authenticate
	 * @returns LoginResult if successful, null if authentication fails
	 */
	async login(username: string, password: string): Promise<LoginResult | null> {
		const adminPassword = envConfig.ADMIN_PASSWORD

		// Verify credentials
		if (username !== "admin" || password !== adminPassword) {
			return null
		}

		// Create session
		const sessionId = ulid()
		const sessionData: SessionData = { username }
		sessionCache.set(sessionId, sessionData)

		return {
			sessionId,
			username,
		}
	}
}
