import type { EnvConfig } from "src/shared/config/env"

declare global {
	namespace NodeJS {
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type
		interface ProcessEnv extends EnvConfig {}
	}
}

export { }
