# Merge member-business and member-document into the members module

The `member_business` and `member_documents` tables, which previously lived in their own top-level modules (`src/modules/member-business/`, `src/modules/member-document/`), are colocated under `src/modules/members/`. The members module owns all four member-related tables: `members`, `positions`, `member_business`, `member_documents`.

## Why

`POST /api/v1/members` (create a new member) must atomically insert into `members`, `member_documents`, and `member_business` inside a single database transaction. AGENTS.md §1 mandates "never cross-import across different modules directly," so no single feature module may import another's repository to coordinate that transaction. The realistic options were: (a) a dedicated `member-creation` orchestrator module sitting above the three data modules, (b) coordinate in the route handler (which AGENTS.md calls "Routing Layer Only"), or (c) colocate the three tables in one module that owns the transaction.

We chose (c) because member creation is the dominant write path for all three tables — they have no independent life outside a member. A separate `member-creation` module would be a thin orchestrator over data modules that are never read or written any other way, adding a layer without a real boundary. The colocation is a deliberate, scoped exception to the module-boundary guidance: it applies only to tables whose lifecycle is bound to the member aggregate.

The `member_business.category_id` foreign key references `business_categories(id)` in another module. This is a database-level constraint only — no code import — so it does not violate AGENTS.md. Category existence is trusted to the FK (no pre-check query); a violation surfaces as an insert error.

## Considered options

- **Colocate in members/ (chosen).** One module owns the transaction and all four tables. Simplest coordination; matches the aggregate lifecycle. Cost: members/ is larger than a "pure single-table" module.
- **Dedicated member-creation orchestrator module.** Cleanest separation in principle. Rejected: the three data modules would have exactly one consumer (the orchestrator) and no independent read/write paths, so the boundary would be ceremonial rather than meaningful.
- **Coordinate in the route handler.** Rejected: AGENTS.md §1 designates `app/` as routing layer only.

## Consequences

- The `member-business/` and `member-document/` top-level module folders are removed; their `repository/sql/` contents move under `members/repository/`.
- The sqlc config gets a single members entry whose schema covers all four tables.
- A 1:1 enforcement gap was fixed alongside this merge: `member_business.member_id` gains a `UNIQUE` constraint so the table actually enforces "one business per member" (previously the plain FK allowed many).
- If `member_documents` or `member_business` later gain independent consumers (e.g. a standalone document-management UI), this decision should be revisited and the tables promoted back to their own modules with an orchestrator.
