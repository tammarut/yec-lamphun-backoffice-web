---
status: accepted
---

# Feature modules own their frontend components and hooks

Feature UI code lives inside its feature module: the members view/table/dialog components sit in `src/modules/members/components/`, the `use-members` data hook in `src/modules/members/hooks/`, and future client Valibot schemas will go to `src/modules/members/schemas/`. Feature UI does **not** live in `src/shared/components/` — that folder is reserved for genuinely cross-cutting UI (shadcn primitives, layout, generic form fields), matching how `src/modules/shared/` reserves infra for non-domain contracts.

## Why

- **"Members" isn't shared.** A members-specific table, card grid, and delete dialog have exactly one consuming feature. Parking them under `shared/components/<feature>` erodes the meaning of "shared" and quietly invites other modules to import them.
- **The alternative was considered and rejected**: keep the status quo `src/shared/components/members/`. The 3b member wizard will add a step-form component tree plus client schemas on top; growing the shared tree with single-consumer feature code is the wrong direction.
- **The other alternative was considered and rejected**: a new `src/features/` top level. It duplicates `src/modules/` semantics — two homes for feature code, and every agent/reviewer must decide which — for zero benefit over extending the module that already owns the domain.
- A module owning its whole vertical slice (domain → use-case → API → UI) keeps 3b-era files born next to the code they render, per the UI-conversion plan's module-first structure.

## Consequences

- The client/server boundary inside a module is a **written convention in AGENTS.md §1**: `components/` and `hooks/` must not import their module's `repository/`, `use-case/`, or `domain/` layers (type-only imports excepted). It is deliberately not a lint rule — enforced in review, like the module cross-import boundary above it.
- Import paths moved mechanically (`src/shared/components/members/*` → `src/modules/members/{components,hooks}/*`); `vi.mock()` module-ID strings in tests must be rewritten alongside import statements or mocks silently stop applying.
- Future feature modules with UI (renewals review, org chart) follow the same `components/`/`hooks/`/`schemas/` layout.
