/**
 * Base authentication error class
 */
export class AuthError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "AuthError"
		// Maintains proper stack trace for where error was thrown
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor)
		}
	}
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends AuthError {
	constructor() {
		super("Invalid credentials")
		this.name = "InvalidCredentialsError"
	}
}
