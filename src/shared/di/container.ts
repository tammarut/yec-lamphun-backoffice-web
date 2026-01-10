import "reflect-metadata"
import { container } from "tsyringe"
import { TOKENS } from "./tokens"
import { envConfig } from "../config/env"
import { sessionCache } from "../lib/session-cache"
import { SessionStore } from "../lib/session-store"

// Register EnvConfig
container.register(TOKENS.ENV_CONFIG, {
	useValue: envConfig,
})

// Register SessionStore
// We use the singleton instance `sessionCache` that is already configured
container.register(TOKENS.SESSION_STORE, {
	useValue: sessionCache,
})

// Register classes if needed, though @injectable usually handles auto-registration for transient/singleton
// Explicitly registering SessionStore class if we wanted new instances (optional, we are using value above)
// container.register(SessionStore, { useClass: SessionStore });

export { container }
