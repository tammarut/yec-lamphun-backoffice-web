import type { EnvConfig } from "src/shared/config/env"

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EnvConfig {
			NEXT_RUNTIME: "nodejs" | "edge"
			TZ?: string
		}
	}
}

export { }
