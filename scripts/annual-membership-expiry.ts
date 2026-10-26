/**
 * Annual Membership Expiry entry point — ADR-0027. The once-a-year job
 * (Dokploy Application schedule job, cron `1 0 1 12 *`) that moves every
 * live ACTIVE member whose Membership Expiry precedes the Renewal Season
 * boundary to EXPIRED. A NULL `expires_at` is deliberately never matched
 * (repo-review ruling, PR #109). Expiry-keyed and idempotent: safe to re-run
 * on any date for rehearsal or recovery.
 *
 * Thin shell over the members module's {@link AnnualMembershipExpiryService}:
 * parse args STRICTLY — anything other than `--dry-run` aborts with exit 1,
 * so a typo'd flag (`--dryrun`, `-d`) can never fall through to a live
 * mutation (scrutiny finding 1) — boot the app's logger exactly as the
 * server does (production emits LogTape JSON lines to stdout — Dokploy's job
 * history is the run trace), resolve the service from the DI container, and
 * emit EXACTLY ONE structured log line per run on BOTH outcomes — `info` on
 * success, `error` on any failure — so every run is verifiable afterward,
 * then exit 0/1. Every line carries `boundary`: the Renewal Season boundary
 * the run date implies, recomputed here via the same pure rule the service
 * executes against (it is a pure function of the date, so the two can never
 * diverge — scrutiny finding 4). Local rehearsal:
 * `bun scripts/annual-membership-expiry.ts [--dry-run]` — NODE_ENV defaults
 * to production for standalone runs (see `./standalone-env`, scrutiny
 * finding 2), so the JSON-lines sink is the default everywhere.
 *
 * Boot order mirrors src/instrumentation.ts (which does not run outside
 * Next): env default → reflect-metadata → configureLogger → container
 * resolve.
 */
import "./standalone-env"
import "reflect-metadata"

import { dispose } from "@logtape/logtape"

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { AnnualMembershipExpiryService } from "src/modules/members/use-case/annual-membership-expiry/annual-membership-expiry.service"
import { computeRenewalSeasonBoundary } from "src/modules/members/use-case/annual-membership-expiry/renewal-season"
import { configureLogger, createLogger } from "src/shared/lib/logger/logger"

/** The only CLI flag the script understands. */
const DRY_RUN_FLAG = "--dry-run"

/** Run the annual expiry with the given CLI args; returns the exit code. */
export async function run(argv: readonly string[]): Promise<number> {
	const startedAtMs = Date.now()
	const runAt = new Date().toISOString()
	const boundary = computeRenewalSeasonBoundary(new Date(runAt)).toISOString()

	await configureLogger()
	const logger = createLogger(["members", "annual-membership-expiry"])

	const unknownArgs = argv.filter((arg) => arg !== DRY_RUN_FLAG)
	if (unknownArgs.length > 0) {
		logger.error(
			"annual membership expiry aborted: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_code={errorCode} error_message={errorMessage}",
			{
				runAt: runAt,
				boundary: boundary,
				expiredCount: null,
				durationMs: Date.now() - startedAtMs,
				dryRun: false,
				errorCode: "INVALID_ARGUMENTS",
				errorMessage: `unknown CLI arguments: ${unknownArgs.join(" ")} (only ${DRY_RUN_FLAG} is supported)`,
			}
		)
		return 1
	}
	const dryRun = argv.includes(DRY_RUN_FLAG)

	try {
		const expiryService = container.resolve<AnnualMembershipExpiryService>(REGISTER_KEY.ANNUAL_MEMBERSHIP_EXPIRY_SERVICE)
		const result = await expiryService.execute({ dryRun: dryRun })

		if (result.isErr()) {
			logger.error(
				"annual membership expiry failed: run_at={runAt} boundary={boundary} expired_count={expiredCount} duration_ms={durationMs} dry_run={dryRun} error_code={errorCode} error_message={errorMessage}",
				{
					runAt: runAt,
					boundary: boundary,
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
			boundary: boundary,
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
				boundary: boundary,
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
	// Flush + close the LogTape sinks deterministically — process.exit() alone
	// drops the queued stream write, since the prod sink writes async
	// (scrutiny finding 3, replacing the earlier 100ms sleep heuristic).
	await dispose()
	process.exit(code)
}
