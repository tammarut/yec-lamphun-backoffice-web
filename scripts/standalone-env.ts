/**
 * Standalone entry points (scripts/*.ts) run under bare Bun, where nothing
 * sets NODE_ENV — unlike `next dev/build/start`, which always do. Default to
 * production BEFORE any import that validates env or picks a log sink, so a
 * script behaves exactly like the deployed container (which runs with
 * NODE_ENV=production, Dockerfile line 49) — scrutiny finding 2, PR #109.
 * Must be the FIRST import of an entry point: ESM evaluates side-effect
 * imports in declaration order.
 */
;(process.env as Record<string, string | undefined>)["NODE_ENV"] ??= "production"
