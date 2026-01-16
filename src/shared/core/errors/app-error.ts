export class AppError extends Error {
	constructor(
		public readonly message: string,
		public readonly code: string = "INTERNAL_SERVER_ERROR",
		public readonly cause?: unknown,
	) {
		super(message)
		this.name = this.constructor.name
	}
}

export class DatabaseError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "DATABASE_ERROR", cause)
	}
}
