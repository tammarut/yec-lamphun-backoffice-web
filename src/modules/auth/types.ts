export interface SessionData {
	username: string
	ip: string | null
	userAgent: string | null
	createdAt: Date
	lastAccessedAt: Date
	expiresAt: Date
	isPersistent: boolean
}

export type LoginParams = {
	username: string
	password: string
	rememberMe: boolean
	ip: string | null
	userAgent: string | null
}
