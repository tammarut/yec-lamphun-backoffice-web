import type { IAuthConfig, IIdGenerator, ISessionStore } from "./interfaces"
import type { LoginResult, SessionData } from "./types"

export class AuthService {
	constructor(
		private readonly config: IAuthConfig,
		private readonly sessionStore: ISessionStore,
		private readonly idGenerator: IIdGenerator
	) {}

	/**
	 * Authenticate user with username and password
	 * @param username - The username to authenticate
	 * @param password - The password to authenticate
	 * @returns LoginResult if successful, null if authentication fails
	 */
	async login(username: string, password: string): Promise<LoginResult | null> {
		const adminPassword = this.config.ADMIN_PASSWORD

		// Verify credentials
		if (username !== "admin" || password !== adminPassword) {
			return null
		}

		// Create session
		const sessionId = this.idGenerator.generate()
		const sessionData: SessionData = { username }
		await this.sessionStore.set(sessionId, sessionData)

		return {
			sessionId,
			username,
		}
	}
}
