# Bun SQL native for dynamic read queries (sqlc retained for static queries)

The members module's repository uses **two query idioms**: sqlc-generated queries (via the existing `sql/queries.sql` → `sqlc generate` → `sql/sqlc-generated/queries_sql.ts` workflow) for static queries (writes, PK/UNIQUE lookups, fixed-shape joins), and **Bun SQL native tagged templates** for dynamic read queries whose `WHERE` / `ORDER BY` / `LIMIT` shape varies at runtime. The first consumer is the GET-list-members endpoint (optional status / search / cursor predicates, dynamic sort column and direction).

## Why

`MembersRepository` already holds a Bun `SQL` handle (`this.dbClient.getRwConnection()`) and casts it to postgres.js's `Sql` type (`as unknown as Sql`) so the sqlc-generated functions — which expect the postgres.js tagged-template shape — type-check. Bun SQL mimics that API closely enough for the cast to be honest for *static* queries, but the cast is unverified, and the sqlc workflow fundamentally requires a **static** SQL string in `queries.sql` at generation time.

A paginated list endpoint with optional filters is the canonical case sqlc is bad at: the `WHERE` clause has up to three optional predicates (`status IN (...)`, `search LIKE`, cursor keyset), `ORDER BY` is one of three columns in one of two directions, and `LIMIT` is `n+1`. Forcing this through sqlc means either many near-duplicate generated functions (one per predicate combination) or a single function plastered with `WHERE 1=1` and `sqlc.arg()` placeholders that the caller must always supply — both defeat sqlc's value (compile-time-checked static SQL).

Bun SQL's tagged templates give the same parameter-binding safety sqlc provides (values are bound, not string-interpolated), and additionally support **composable fragments** — `sql\`AND m.status IN (${sql(statuses)})\`` can be conditionally included or omitted — which is exactly the shape a dynamic read needs. The value of sqlc is static-SQL type safety; for dynamic SQL that safety is unavailable regardless of tool, and Bun SQL's binding is the safest dynamic option.

This is **not** a repeal of ADR-0001. ADR-0001 is about *how to annotate* sqlc queries (`:many`, not `:one`) under `noUncheckedIndexedAccess`; it presupposes sqlc is the tool and says nothing about when to choose sqlc vs. an alternative. Static queries in this repo (member insert, member-detail join, system-settings upsert, business-categories list) stay sqlc — they gain nothing from hand-written SQL and lose the generated row types.

## Considered options

- **Bun SQL native for dynamic reads, sqlc retained for static (chosen).** Dynamic queries get composable fragments and proper binding; static queries keep their generated types and `sqlc generate` workflow. Cost: two query idioms in one repository file, which a future reader must learn to distinguish.
- **Force the list query through sqlc.** Either a single `WHERE 1=1` query whose caller always supplies every optional predicate (passing trivially-true values when absent), or one generated function per predicate shape. Rejected:前者 defeats the purpose of a static query (the static string is meaningless), and the latter multiplies generated code for no type benefit since the dynamic shape can't be type-checked anyway.
- **Migrate the whole repository off sqlc to Bun SQL.** Rejected: the static queries work fine under sqlc, their generated row types are genuinely useful (the `MemberDetailReadModel` mapping in `getMemberDetailById` relies on sqlc's typed row), and migrating them is a large, out-of-scope change that would also obsolete ADR-0001.

## Consequences

- `MembersRepository` (and any future repository with dynamic reads) may inject `DatabaseClient` and call `this.dbClient.getRwConnection()` directly for dynamic reads, **without** the `as unknown as Sql` cast — the result is already the native Bun `SQL` type. The cast is kept only at the sqlc call sites that need the postgres.js type.
- Dynamic SQL fragments must use Bun SQL's `sql(...)` helper for values and `sql.raw(...)` / `sql(columnName)` for identifiers — never string concatenation. Identifiers (`ORDER BY` column, sort direction) come from a closed enum validated by Valibot, so `sql.raw` is safe there; values (`status` array, `search` string, `cursor` id, `limit`) always go through bound parameters.
- New static queries still go in `queries.sql` and through `sqlc generate`. New dynamic reads go directly in the repository method. The rule of thumb: if the SQL string is identical at every call site, use sqlc; if its shape varies, use Bun SQL.
- The repository's unit tests mock at the `DatabaseClient` boundary for sqlc-backed methods (via `vitest-mock-extended`) but Bun-SQL-backed methods are harder to unit-test in isolation (they build a query then execute it). The canonical testing approach for Bun-SQL methods is documented in the implementation plan: assert behavior through the service/use-case layer with a mocked `IMemberRepository`, and reserve repository-level SQL assertions for integration tests (out of scope for this ADR).
