import { SessionStore } from "./session-store"
import { ulidGenerator } from "./ulid-generator"

// Export singleton instance for backward compatibility
export const sessionCache = new SessionStore(86400, ulidGenerator) // 1 day TTL
