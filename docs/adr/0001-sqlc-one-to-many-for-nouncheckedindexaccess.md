# Annotate sqlc single-row queries as `:many`, not `:one`

We annotate sqlc queries that return at most one row (e.g. `UPDATE ... WHERE feature = $1 RETURNING ...`) as `:many` rather than `:one`, and narrow to the first row in hand-written repository code. This is a deliberate deviation from the obvious annotation, made so that raw `sqlc generate` output compiles under our strict `tsconfig` (`noUncheckedIndexedAccess: true`) without any hand-editing of generated files.

## Why

sqlc's `:one` template generates `const row = rows[0]; return { f: row[0], ... }`. Under `noUncheckedIndexedAccess`, `rows[0]` is `T | undefined`, so `row[0]` errors with `TS18048`. The `:many` template generates `.map((row) => ...)` where the callback binds `row` to the element type (never `undefined`), so it type-checks as-is.

Previously the generated file was hand-edited (`.map(...)[0] ?? null`) to work around this. That edit was toxic: it made the committed generated file impossible to reproduce from its source — re-running `sqlc generate` reverted the edit and broke the build with 5 `tsc` errors.

## Considered options

- **`:many` + repository narrowing (chosen).** Raw generated output compiles. The "at most one row" narrowing moves into hand-written repository code, where narrowing is legitimate. For queries constrained by a PRIMARY KEY / UNIQUE column, taking `rows[0]` is safe.
- **Turn off `noUncheckedIndexedAccess`.** One-line `tsconfig` change, keeps `:one`. Rejected: trades a localized smell for a repo-wide loss of array-index type safety.
- **Gitignore generated files + regenerate in Docker/CI.** Rejected: regeneration only works once raw output compiles (this ADR solves that), and gitignoring forces `sqlc generate` to run in three places (Docker, CI, every dev clone) plus onboarding docs. Committing raw generated files costs nothing because they are now regenerable to a zero diff.

## Consequences

- **Generated files are committed raw and never hand-edited.** The workflow is: edit `queries.sql` → `sqlc generate` → commit the output. If generated code fails `tsc`, fix it at the source (the annotation or the query), never in the output file. A second `sqlc generate` over the committed state produces no diff (verified), so the committed file is the source of truth.
- **`rows[0]` no longer detects impossible duplicate rows** the way sqlc's `:one` template did (`if (rows.length !== 1) return null`). This is safe for queries whose `WHERE` targets a PRIMARY KEY or UNIQUE column; the database constraint guarantees at most one row.
- **Any future sqlc query that needs "exactly one" semantics must be annotated `:many`** and narrowed in its repository, following the pattern in `SystemSettingsRepository.updateSetting`.
