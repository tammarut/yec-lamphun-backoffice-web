import type { EnvConfig } from "src/shared/config/env"

export async function register() {
	const runtime = process.env["NEXT_RUNTIME"]
	if (runtime === "nodejs") {
		try {
			// 1. Logging first — everything below logs through LogTape.
			//    See docs/adr/0009-structured-logging-via-logtape.md.
			const { configureLogger, createLogger } = await import("src/shared/lib/logger/logger")
			await configureLogger()

			// 2. We need to import 'reflect-metadata' here because this function runs
			//    before other parts of the application where it might be imported.
			await import("reflect-metadata")

			const { container } = await import("src/modules/container")
			const { REGISTER_KEY } = await import("src/modules/di-tokens")
			const { DatabaseClient } = await import("src/shared/lib/db/database-client")

			// 3. Boot-time guardrail for the Turnstile test bypass (#138, ADR-0029):
			//    a server carrying this env has a bypassable human gate — say so
			//    loudly, once, at start, on EVERY environment that sets it (dev by
			//    convention; prod = the state ops must never miss). Deliberately NOT
			//    a crash (blast-radius ruling on env knobs). Runs BEFORE the DB check
			//    so the line is visible even in a crash-looping boot.
			const envConfig = container.resolve<EnvConfig>(REGISTER_KEY.ENV_CONFIG)
			if (envConfig.CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN.length > 0) {
				const logger = createLogger(["api", "middleware", "turnstile-gate"])
				logger.warn("Turnstile TEST BYPASS is active: CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN is set — guests holding the value skip human verification on this server")
			}

			// Ensure DatabaseClient is resolved and verifyConnection is called
			const dbClient = container.resolve(DatabaseClient)
			const result = await dbClient.verifyConnection()

			if (result.isErr()) {
				throw result.error
			}
		} catch (error) {
			throw error
		}
	}
}
