export interface SessionData {
	readonly username: string
	readonly ip: string | null
	readonly userAgent: string | null
	readonly createdAt: Date
	readonly lastAccessedAt: Date
	readonly expiresAt: Date
	readonly isPersistent: boolean
	readonly ttlSeconds: number
}

export type LoginParams = {
	username: string
	password: string
	rememberMe: boolean
	ip: string | null
	userAgent: string | null
}
