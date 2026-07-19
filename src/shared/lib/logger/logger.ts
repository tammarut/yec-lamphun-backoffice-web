import { Writable } from "node:stream"

import { configure, getConsoleSink, getJsonLinesFormatter, getLogger, getStreamSink, type Logger } from "@logtape/logtape"

// Root category for every logger in this app. Callers never type it themselves;
// `createLogger` prepends it. See docs/adr/0009-structured-logging-via-logtape.md.
const ROOT_CATEGORY = ["yec-lamphun"]

// LogTape's `configure()` throws if called more than once per process, so we
// guard it locally. Instrumentation fires once on boot; the flag exists only
// to make accidental double-imports a no-op rather than a crash.
let configured = false

/**
 * Configure LogTape once per process. Call from `src/instrumentation.ts`
 * before any code that logs.
 *
 * - Local (`NODE_ENV !== "production"`): console sink, pretty output, `debug` floor.
 * - Production: stream sink to stdout with JSON Lines formatter, `info` floor.
 *
 * The production sink writes via `stream.write(...)`, NOT `console.*`, so
 * `next.config.ts`'s `compiler.removeConsole: isProduction` has nothing to
 * strip. The two concerns are decoupled on purpose — see ADR-0009.
 */
export async function configureLogger(): Promise<void> {
	if (configured) return

	const isProd = process.env["NODE_ENV"] === "production"
	await configure({
		sinks: {
			console: getConsoleSink(),
			stream: getStreamSink(Writable.toWeb(process.stdout), {
				formatter: getJsonLinesFormatter(),
			}),
		},
		loggers: [
			{
				category: ROOT_CATEGORY,
				sinks: isProd ? ["stream"] : ["console"],
				lowestLevel: isProd ? "info" : "debug",
			},
			{
				// LogTape's own diagnostics (sink exceptions, misconfiguration).
				// Floor at warning silences the one-shot "configured" notice while
				// still surfacing real logging-system failures. Routed to the same
				// sink as the app — LogTape guards against the resulting feedback
				// loop internally. See https://logtape.org/manual/categories#meta-logger
				category: ["logtape", "meta"],
				sinks: isProd ? ["stream"] : ["console"],
				lowestLevel: "warning",
			},
		],
	})
	configured = true
}

/**
 * Build a category-scoped logger that auto-prefixes the app root.
 *
 * Pass a layer-tagged path per the ADR-0009 taxonomy:
 * `<feature>/<route|service|use-case|shared>/<name>`.
 *
 * @example
 * const logger = createLogger(["members", "route", "create"])
 * logger.error("create failed", { code: error.code, cause: error.cause })
 */
export function createLogger(category: readonly string[]): Logger {
	return getLogger([...ROOT_CATEGORY, ...category])
}
