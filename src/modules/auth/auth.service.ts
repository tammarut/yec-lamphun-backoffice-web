import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"
import type { EnvConfig } from "src/shared/config/env"
import { REGISTER_KEY } from "src/modules/container"
import type { ISessionStore } from "./interfaces"
import type { SessionData } from "./types"
import { InvalidCredentialsError, InvalidSessionError } from "./errors"

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
		const adminPassword = this.config.ADMIN_PASSWORD

		// Verify credentials
		if (username !== "admin" || password !== adminPassword) {
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
	 * @returns Result void if successful, error if session invalid
	 */
	logout(sessionId: string): Result<void, Error> {
		const deleted = this.sessionStore.delete(sessionId)

		if (!deleted) {
			return err(new InvalidSessionError())
		}

		return ok(undefined)
	}
}
