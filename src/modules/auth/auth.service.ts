import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"
import type { EnvConfig } from "src/shared/config/env"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { ISessionStore } from "./interfaces"
import type { SessionData } from "./types"
import { AuthError, InvalidCredentialsError } from "./errors"

@injectable()
export class AuthService {
	constructor(
		@inject(REGISTER_KEY.ENV_CONFIG) private readonly config: EnvConfig,
		@inject(REGISTER_KEY.SESSION_STORE) private readonly sessionStore: ISessionStore
	) {}

	/**
	 * Authenticate user with username and password
	 * @param username - The username to authenticate
	 * @param password - The password to authenticate
	 * @returns Result with sessionId if successful, error if authentication fails
	 */
	login(username: string, password: string): Result<string, Error> {
		const adminUsername = this.config.ADMIN_USERNAME
		const adminPassword = this.config.ADMIN_PASSWORD

		// Verify credentials
		if (username !== adminUsername || password !== adminPassword) {
			return err(new InvalidCredentialsError())
		}

		// Create session
		const sessionData: SessionData = { username }
		const sessionId = this.sessionStore.createSession(sessionData)

		return ok(sessionId)
	}

	/**
	 * Logout user by invalidating their session
	 * @param sessionId - The session ID to invalidate
	 * @returns Result void if successful (idempotent)
	 */
	logout(sessionId: string): Result<void, Error> {
		this.sessionStore.delete(sessionId)
		return ok(undefined)
	}

	/**
	 * Validate a session by ID
	 * @param sessionId - The session ID to validate
	 * @returns Result with session data if valid, error if invalid or expired
	 */
	validateSession(sessionId: string): Result<SessionData, Error> {
		const session = this.sessionStore.get(sessionId)

		if (!session) {
			return err(new AuthError("Unauthorized"))
		}

		return ok(session)
	}
}
