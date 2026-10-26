/**
 * Annual Membership Expiry entry point — ADR-0027. The once-a-year job
 * (Dokploy Application schedule job, cron `1 0 1 12 *`) that moves every
 * live ACTIVE member whose Membership Expiry precedes the Renewal Season
 * boundary to EXPIRED. A NULL `expires_at` is deliberately never matched
 * (repo-review ruling, PR #109). Expiry-keyed and idempotent: safe to re-run
 * on any date for rehearsal or recovery.
 *
 * Thin shell over the members module's {@link AnnualMembershipExpiryService}:
 * parse `--dry-run`, boot the app's logger exactly as the server does
 * (production emits LogTape JSON lines to stdout — Dokploy's job history is
 * the run trace), resolve the service from the DI container, and emit EXACTLY
 * ONE structured log line per run on BOTH outcomes — `info` on success,
 * `error` on any failure — so every run is verifiable afterward, then exit
 * 0/1. Local rehearsal: `bun scripts/annual-membership-expiry.ts [--dry-run]`.
 *
 * Boot order mirrors src/instrumentation.ts (which does not run outside
 * Next): reflect-metadata → configureLogger → container resolve.
 */
import "reflect-metadata"

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { AnnualMembershipExpiryService } from "src/modules/members/use-case/annual-membership-expiry/annual-membership-expiry.service"
import { configureLogger, createLogger } from "src/shared/lib/logger/logger"

/** Run the annual expiry with the given CLI args; returns the exit code. */
export async function run(argv: readonly string[]): Promise<number> {
	const startedAtMs = Date.now()
	const runAt = new Date().toISOString()
	const dryRun = argv.includes("--dry-run")

	await configureLogger()
	const logger = createLogger(["members", "annual-membership-expiry"])

	try {
		const expiryService = container.resolve<AnnualMembershipExpiryService>(REGISTER_KEY.ANNUAL_MEMBERSHIP_EXPIRY_SERVICE)
		const result = await expiryService.execute({ dryRun: dryRun })

		if (result.isErr()) {
			logger.error(
				"annual membership expiry failed: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_code={errorCode} error_message={errorMessage}",
				{
					runAt: runAt,
					boundary: null,
					expiredCount: null,
					durationMs: Date.now() - startedAtMs,
					dryRun: dryRun,
					errorCode: result.error.code,
					errorMessage: result.error.message,
				}
			)
			return 1
		}

		const outcome = result.value
		logger.info("annual membership expiry completed: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun}", {
			runAt: runAt,
			boundary: outcome.boundary.toISOString(),
			expiredCount: outcome.expiredCount,
			durationMs: Date.now() - startedAtMs,
			dryRun: dryRun,
		})
		return 0
	} catch (error) {
		logger.error(
			"annual membership expiry crashed before completing: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_message={errorMessage}",
			{
				runAt: runAt,
				boundary: null,
				expiredCount: null,
				durationMs: Date.now() - startedAtMs,
				dryRun: dryRun,
				errorMessage: error instanceof Error ? error.message : String(error),
			}
		)
		return 1
	}
}

if (import.meta.main) {
	const code = await run(process.argv.slice(2))
	// process.exit() drops queued stream writes — the run's one log line would
	// be lost to the exit race (the prod stream sink writes async). A 100ms
	// beat lets stdout flush; invisible at a once-a-year cadence.
	await new Promise((resolve) => setTimeout(resolve, 100))
	process.exit(code)
}
