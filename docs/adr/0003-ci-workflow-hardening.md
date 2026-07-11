# CI workflow hardening: env, triggers, version pin, lint, build command, concurrency, permissions

The GitHub Actions CI workflow (`.github/workflows/ci.yml`) was hardened along seven axes. This ADR records the decision behind each so future contributors understand why the workflow looks the way it does, and don't revert a decision back to the fragile default it replaced.

## 1. `SKIP_ENV_VALIDATION` instead of dummy env vars

### Why

The Build step previously carried a 13-line `env:` block of dummy values (`ADMIN_PASSWORD: "build-password"`, `DATABASE_URL: "postgres://..."`, `R2_*` placeholders, etc.) so that `next build` — which transitively imports `envConfig` (`src/shared/config/env.ts`) — would pass t3-env's build-time validation.

This list was a manual mirror of the required-vars set in `env.ts`, and it had already drifted from the schema **twice**, requiring two fix-up commits (`bd5df1e` "add missing ADMIN_USERNAME", `8d9a270` "add required env variable"). Every new required env var would silently break every PR's CI until someone hand-edited the workflow.

The codebase already ships an escape hatch for exactly this: `env.ts:21` — `skipValidation: process.env["SKIP_ENV_VALIDATION"] === "true"`. `vitest.config.mts` already uses it. The dummy values never tested anything real — they were `minLength(1)` string checks against literals that can never fail. "CI validates the env config" was an illusion; it only validated that *the list was complete*, which is exactly the chore that kept breaking.

### Considered options

- **`SKIP_ENV_VALIDATION: "true"` (chosen).** One line, self-maintaining. Honest about what the build needs. Matches the vitest precedent. Tradeoff: CI no longer catches a malformed valibot schema at build time — but the dummy values never caught that either; they only checked string non-emptiness.
- **Keep dummies, make them self-maintaining** (`.env.ci` file or script generated from the schema). Keeps validation running in CI. Rejected: adds tooling surface for an illusion of safety — the dummies can't fail validation, so they test nothing.

### Consequences

- Adding a new required env var to `env.ts` no longer requires editing `ci.yml`.
- Runtime env validation still happens where it matters: at server startup (`instrumentation.ts` `register()`), with real values from the deployment environment.
- The `DB_*` optional vars (which have defaults in `env.ts`) are no longer set in CI — they were always dead config.

## 2. Triggers: `push: main` + `workflow_dispatch`

### Why

The workflow previously triggered only on `pull_request` to `main`. After merge, `main` itself was never built or tested by CI — a broken merge, a dependency update, or an env-schema change that only manifests at runtime would go undetected until the next PR or a deploy.

### Considered options

- **Add `push: branches: ["main"]` + `workflow_dispatch` (chosen).** Catches post-merge breaks, force-pushes that bypass PR review, and direct commits to `main`. `workflow_dispatch` allows re-running CI against `main` after changing secrets or external deps without opening a PR.
- **PR-only.** Rejected: there's a window where `main` is broken and nobody knows; the next contributor pulls a broken `main` and wastes time.
- **`push: main` only (no dispatch).** Rejected: dispatch is additive and useful for secret/dep changes that don't touch source.

### Consequences

- Doubled CI minutes on merge commits. Negligible for a single ~6-minute job on a small team.

## 3. Bun version pinned via `packageManager`

### Why

`oven-sh/setup-bun@v2` was called with no version pin. `bun.lock` pins **dependencies**, but the **Bun runtime version** was unpinned — CI installed whatever latest stable Bun the runner had. A breaking Bun release would silently change every PR's runtime; "works on my machine" would diverge from CI with no signal.

### Considered options

- **`"packageManager": "bun@1.3.5"` in `package.json` (chosen).** `setup-bun@v2` auto-detects this field, so CI uses the exact version developers run locally. No `with:` config needed in `ci.yml`. Bumping Bun is a deliberate one-line change. Matches the Corepack-style convention used by pnpm/yarn.
- **`with: bun-version: "1.3.5"` in `ci.yml`.** Rejected: version lives in CI config, divorced from the rest of the project's tooling metadata. Two places to think about Bun version.
- **Leave unpinned.** Rejected: breaking Bun releases silently change the runtime; no signal.

### Consequences

- Bumping Bun is a deliberate change to `package.json`, visible in code review.
- `setup-bun@v2` caching is already enabled by default — no extra config needed.

## 4. `bun run lint` step added

### Why

`package.json` defines a `lint` script (`eslint`), and AGENTS.md §4 enforces strict compiler compliance + tab indentation, but CI never ran lint. Lint regressions could land on `main` as long as `tsc` and `next build` passed. ESLint catches things they don't (unused imports, hook rule violations, `noPropertyAccessFromIndexSignature` edge cases).

### Considered options

- **Add `bun run lint` step (chosen).** Closes the gap between the documented standard and what's actually enforced. Cheap (~2-4s).
- **Rely on husky `pre-commit`/`pre-push` hooks.** Rejected: hooks are bypassable (`--no-verify`) and not every contributor has them installed.

### Consequences

- CI now runs three `bun run` steps — `test`, `lint`, `build` — all sourced from `package.json`, none duplicated in `ci.yml`.

## 5. Build uses `bun run build` (single source of truth)

### Why

CI ran `bun x --bun next build`, but `package.json` defines `"build": "rm -rf .next && bun --bun next build"`. Two divergences: (1) CI skipped the `.next` clean (moot on a fresh runner, but inconsistent with local), and (2) `bun x` vs `bun --bun` are different invocations that happen to resolve to the same `next` binary after `bun install`. The build command was defined in two places and had already drifted.

### Considered options

- **`bun run build` in CI (chosen).** Eliminates duplication; CI runs exactly what developers run. The `rm -rf .next` is a harmless no-op on a fresh runner. Matches the `bun run test` pattern already in use.
- **Keep `bun x --bun next build`.** Rejected: two places to maintain the build command, already diverged.

### Consequences

- The build command is defined in exactly one place: `package.json`.

## 6. Concurrency control with `cancel-in-progress`

### Why

Without concurrency control, every push on a busy PR (force-pushes during review, rapid commits to `main`) kicked off a fresh ~6-minute job, and they all ran in parallel, wasting runner minutes.

### Considered options

- **`concurrency` keyed by branch/PR with `cancel-in-progress: true` (chosen).** New pushes cancel superseded runs. 3 lines, zero maintenance.
- **Leave it.** Rejected: parallel runs are wasteful and scale with team size; the fix is free.

### Consequences

- On `push: main`, a force-push cancels verification of the previous push — desired, since only the latest branch state matters.

## 7. Least-privilege `permissions: contents: read`

### Why

By default, `GITHUB_TOKEN` gets write scope on a fresh workflow. This job only reads the repo and runs build/test — no commits, no releases, no deploys. GitHub's hardening guide recommends least-privilege.

### Considered options

- **`permissions: contents: read` (chosen).** The job only needs to read source and write check-run status (which doesn't require explicit `checks: write` for the auto-generated check).
- **No permissions block (default write).** Rejected: unnecessary write surface for a build/test-only job.

### Consequences

- If a future step needs to push artifacts, comment on PRs, or deploy, the `permissions:` block must be expanded explicitly — a deliberate security decision rather than a silent default.
