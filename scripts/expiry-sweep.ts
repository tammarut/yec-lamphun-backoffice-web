/**
 * Expiry Sweep entry point — ADR-0027. The once-a-year job (Dokploy
 * Application schedule job, cron `1 0 1 12 *`) that moves every live ACTIVE
 * member whose Membership Expiry precedes the Renewal Season boundary — or
 * who has no expiry at all — to EXPIRED. Expiry-keyed and idempotent: safe
 * to re-run on any date for rehearsal or recovery.
 *
 * Thin shell over the members module's {@link MemberExpirySweepService}:
 * parse `--dry-run`, boot the app's logger exactly as the server does
 * (production emits LogTape JSON lines to stdout — Dokploy's job history is
 * the run trace), resolve the service from the DI container, and emit EXACTLY
 * ONE structured log line per run on BOTH outcomes — `info` on success,
 * `error` on any failure — so every run is verifiable afterward, then exit
 * 0/1. Local rehearsal: `bun scripts/expiry-sweep.ts [--dry-run]`.
 *
 * Boot order mirrors src/instrumentation.ts (which does not run outside
 * Next): reflect-metadata → configureLogger → container resolve.
 */
import "reflect-metadata"

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { MemberExpirySweepService } from "src/modules/members/use-case/expiry-sweep/member-expiry-sweep.service"
import { configureLogger, createLogger } from "src/shared/lib/logger/logger"

/** Run the sweep with the given CLI args; returns the process exit code. */
export async function run(argv: readonly string[]): Promise<number> {
	const startedAtMs = Date.now()
	const runAt = new Date().toISOString()
	const dryRun = argv.includes("--dry-run")

	await configureLogger()
	const logger = createLogger(["members", "expiry-sweep"])

	try {
		const sweepService = container.resolve<MemberExpirySweepService>(REGISTER_KEY.MEMBER_EXPIRY_SWEEP_SERVICE)
		const result = await sweepService.execute({ dryRun })

		if (result.isErr()) {
			logger.error(
				"expiry sweep failed: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_code={errorCode} error_message={errorMessage}",
				{
					runAt,
					boundary: null,
					expiredCount: null,
					durationMs: Date.now() - startedAtMs,
					dryRun,
					errorCode: result.error.code,
					errorMessage: result.error.message,
				}
			)
			return 1
		}

		const { boundary, expiredCount } = result.value
		logger.info("expiry sweep completed: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun}", {
			runAt,
			boundary: boundary.toISOString(),
			expiredCount,
			durationMs: Date.now() - startedAtMs,
			dryRun,
		})
		return 0
	} catch (error) {
		logger.error(
			"expiry sweep crashed before completing: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_message={errorMessage}",
			{
				runAt,
				boundary: null,
				expiredCount: null,
				durationMs: Date.now() - startedAtMs,
				dryRun,
				errorMessage: error instanceof Error ? error.message : String(error),
			}
		)
		return 1
	}
}

if (import.meta.main) {
	process.exit(await run(process.argv.slice(2)))
}
