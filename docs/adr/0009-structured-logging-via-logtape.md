# Structured logging via LogTape

Server-side logging moves from ad-hoc `console.error(...)` calls (seven callsites across routes, services, and use-cases) to **structured logging through [`@logtape/logtape`](https://logtape.org)**. The library is configured once per process, exposes a thin wrapper at `src/shared/lib/logger/logger.ts`, and replaces every existing `console.error` callsite.

## Why

The existing `console.error` calls carry useful structured context (`{ code, cause }`, orphaned-upload lists) but emit unstructured text that no log aggregator can parse in production, and each callsite invents its own ad-hoc tag prefix (`[member-file]`, `[members/create]`, `[get-member-by-id]`, …). A logger library gives us (a) parseable JSON in prod, (b) a single canonical category taxonomy instead of free-text tags, and (c) a level floor that gates what future log calls are even allowed to emit.

LogTape was chosen over alternatives (pino, winston, next-logger) because it is sink-agnostic, zero-dependency, and runtime-portable (works on Node, Bun, edge) — matching the project's Bun-powered Next.js server.

## Sink split: console local, stream prod

The key decision is the **per-environment sink choice**:

- **Local (`NODE_ENV !== "production"`):** `getConsoleSink()` — pretty, human-readable output on the developer's laptop.
- **Production (`NODE_ENV === "production"`):** `getStreamSink(Writable.toWeb(process.stdout), { formatter: getJsonLinesFormatter() })` — emits one JSON object per line to stdout, where a log aggregator (CloudWatch, Loki, Datadog) can ingest it.

This split is what allows `next.config.ts`'s `compiler.removeConsole: isProduction` to stay **unchanged**. The production sink writes via `stream.write(...)`, not `console.*`, so Next.js's SWC strip pass has nothing to touch. The two concerns (logging transport vs. stripping stray debug `console.log` calls) are fully decoupled.

> **⚠️ Do not "fix" `removeConsole` without reading this first.** A future maintainer who sees `removeConsole: isProduction` next to a logger that *appears* to use `console.error` might conclude prod logs are being stripped and exempt the console methods. That is unnecessary — prod logs already flow through the stream sink — and exempting `console.*` would silently re-enable any stray `console.log` debug calls that the strip pass is currently catching. The current config is correct as-is.

### Note on `process.stdout` wrapping

`getStreamSink()` expects a Web `WritableStream`, but `process.stdout` is a Node `Writable`. The wrapper `Writable.toWeb(process.stdout)` (from `node:stream`) bridges the two. This works on both Node and Bun (Bun implements the Node streams API), and Next.js's bundled runtime exposes `node:stream` on the server.

## Caller exposure: thin wrapper, not DI

Callers do **not** import `@logtape/logtape` directly. A single wrapper at `src/shared/lib/logger/logger.ts` owns the root category and exposes:

```ts
export function createLogger(category: readonly string[]): Logger {
	return getLogger(["yec-lamphun", ...category])
}
```

This mirrors how `src/shared/lib/db/database-client.ts`, `ulid-generator.ts`, and `utils/utils.ts` are named after their **capability**, not their vendor (no file here is named `postgres.ts` or `clsx.ts`). The wrapper centralizes the root category, so swapping LogTape later means changing one file, not every callsite.

DI (tsyringe injection of a logger into every service) was explicitly rejected: LogTape loggers are cheap module-level singletons, not request-scoped deps, and forcing a constructor change on ~6 classes for a cross-cutting concern is overkill. The codebase's DI-everything stance applies to domain services and repositories, not to infra utilities.

## Category taxonomy: feature-rooted, layer-tagged

Every callsite calls `createLogger([...])` with a path of the form `<feature>/<layer>/<name>`. The `yec-lamphun` root is auto-prepended by the wrapper, so callers never type it.

| Layer tag | Used by | Example |
|---|---|---|
| `route` | `src/app/api/...` route handlers | `["members", "route", "create"]` |
| `service` | `src/modules/<feature>/*.service.ts` | `["members", "service", "member-file"]` |
| `use-case` | `src/modules/<feature>/use-case/...` | `["members", "use-case", "get-member-by-id"]` |
| `shared` | `src/shared/...` infra | `["shared", "db"]` |

The layer names mirror the architectural boundaries in `AGENTS.md` §1, so LogTape's hierarchical filtering becomes useful rather than decorative: `["yec-lamphun", "members"]` catches a whole feature, `["yec-lamphun", "members", "route"]` catches only its route handlers, `["yec-lamphun", "shared"]` catches all infra.

## Level floor

`debug` in local, `info` in production. The current `console.error` calls are all error-level, but the floor leaves room for future `logger.info("member created", { id })` audit lines without reconfiguring.

## Considered options

- **Console sink everywhere (rejected).** Would force `removeConsole` to exempt `console.*`, re-enabling any stray debug `console.log` calls in prod. Couples logging transport to the strip pass.
- **Stream sink everywhere (rejected).** JSON on the laptop too — loses the "pretty for local" requirement and slows local debugging.
- **Direct `getLogger` re-export, no wrapper (rejected).** Forces the `["yec-lamphun"]` root prefix to be repeated at every callsite; a typo there silently creates an unconfigured logger that no-ops. Re-couples every module to `@logtape/logtape` as an import.
- **DI-tokened logger service (rejected).** Architecturally pure for this repo, but overkill: LogTape loggers are module-level singletons, not request-scoped deps, and forcing constructor changes on ~6 classes for a cross-cutting concern is disproportionate.
- **Global test mock in `vitest.setup.ts` (rejected).** Would silently swallow log output in every test, masking cases where a happy-path test unexpectedly hits the error path. Per-file `vi.mock("src/shared/lib/logger/logger", ...)` is used instead, matching how route tests already mock `src/modules/container`.

## Consequences

- `@logtape/logtape` becomes a runtime dependency (zero transitive deps).
- `src/instrumentation.ts` gains a `configure()` call in its nodejs branch, fired before the existing DB warmup so DB failures flow through LogTape too. Any log call that fires *before* instrumentation runs (during module load) no-ops rather than crashes — LogTape's default behavior for unconfigured loggers.
- Seven production callsites are migrated from `console.error(...)` to `logger.error(...)`; their ad-hoc `[tag]` prefixes are regularized into the category taxonomy.
- Two test files swap `vi.spyOn(console, "error").mockImplementation(...)` for `vi.mock("src/shared/lib/logger/logger", ...)`.
- `next.config.ts`'s `removeConsole` policy is **intentionally unchanged**.
- Out of scope (separate ticket): `business/categories/route.ts:23` returns `{ message: "Internal Server Error" }`, violating `AGENTS.md` §2D's canonical `{ error_message: ... }` shape. That API-contract fix is excluded from this logging work to keep the PR's intent focused.
