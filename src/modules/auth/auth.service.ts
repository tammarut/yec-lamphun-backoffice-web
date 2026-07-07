import * as neverthrow from "neverthrow"
import * as tsyringe from "tsyringe"

import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { AuthError, InvalidCredentialsError } from "./errors"
import type { ISessionStore } from "./interfaces"
import type { LoginParams, SessionData } from "./types"

const SESSION_TTL_PERSISTENT_SECONDS = 30 * 24 * 60 * 60 // 30 days
const SESSION_TTL_DEFAULT_SECONDS = 24 * 60 * 60 // 24 hours

@tsyringe.injectable()
export class AuthService {
	constructor(
		@tsyringe.inject(REGISTER_KEY.ENV_CONFIG) private readonly config: EnvConfig,
		@tsyringe.inject(REGISTER_KEY.SESSION_STORE) private readonly sessionStore: ISessionStore
	) {}

	/**
	 * Authenticate user with username and password
	 * @param params - The login input parameters object
	 * @returns Result with sessionId and TTL if successful, error if authentication fails
	 */
	login(params: LoginParams): neverthrow.Result<{ sessionId: string; ttlSeconds: number }, Error> {
		const { username, password, rememberMe, ip, userAgent } = params

		// Sanitize input username (trim, remove dangerous characters)
		const sanitizedUsername = username.trim().replace(/[<>'"&;\\]/g, "")

		const adminUsername = this.config.ADMIN_USERNAME
		const adminPassword = this.config.ADMIN_PASSWORD

		// Verify credentials
		if (sanitizedUsername !== adminUsername || password !== adminPassword) {
			return neverthrow.err(new InvalidCredentialsError())
		}

		// Determine TTL (in seconds)
		const isPersistent = rememberMe === true
		const ttlSeconds = isPersistent ? SESSION_TTL_PERSISTENT_SECONDS : SESSION_TTL_DEFAULT_SECONDS

		// Build SessionData
		const now = new Date()
		const sessionData: SessionData = {
			username: sanitizedUsername,
			ip,
			userAgent,
			createdAt: now,
			lastAccessedAt: now,
			expiresAt: this.calculateExpirationDate(now, ttlSeconds),
			isPersistent,
			ttlSeconds,
		}

		const sessionId = this.sessionStore.createSession(sessionData, ttlSeconds)

		return neverthrow.ok({ sessionId: sessionId, ttlSeconds: ttlSeconds })
	}

	private calculateExpirationDate(startDate: Date, ttlSeconds: number): Date {
		return new Date(startDate.getTime() + ttlSeconds * 1000)
	}

	/**
	 * Logout user by invalidating their session
	 * @param sessionId - The session ID to invalidate
	 * @returns Result void if successful (idempotent)
	 */
	logout(sessionId: string): neverthrow.Result<void, Error> {
		this.sessionStore.delete(sessionId)
		return neverthrow.ok(undefined)
	}

	/**
	 * Validate a session by ID
	 * @param sessionId - The session ID to validate
	 * @returns Result with session data if valid, error if invalid or expired
	 */
	validateSession(sessionId: string): neverthrow.Result<SessionData, Error> {
		const session = this.sessionStore.get(sessionId)

		if (!session) {
			return neverthrow.err(new AuthError("Not Found session"))
		}

		return neverthrow.ok(session)
	}
}
