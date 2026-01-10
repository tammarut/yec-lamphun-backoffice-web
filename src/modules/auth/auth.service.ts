import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"
import type { EnvConfig } from "src/shared/config/env"
import { TOKENS } from "src/shared/di/tokens"
import type { ISessionStore } from "./interfaces"
import type { SessionData } from "./types"
import { InvalidCredentialsError } from "./errors"

@injectable()
export class AuthService {
	constructor(
		@inject(TOKENS.ENV_CONFIG) private readonly config: EnvConfig,
		@inject(TOKENS.SESSION_STORE) private readonly sessionStore: ISessionStore
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
}
