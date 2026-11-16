---
status: accepted
---

# Feature-based subfolders inside a module's components/ folder

Once a module's `components/` folder mixes multiple features, its files group into **feature subfolders** named after the feature, and the folder root keeps only **module-wide vocabulary** — files imported by two or more of those features (shared labels, badges, dialogs, test fixtures). Filenames never change: folders are namespaces, so only import strings move. There are no barrel `index.ts` files. The members module is the reference implementation: `member-directory/` (the list page, 7 files + 4 tests), `member-wizard/` (the create/edit wizard, 11 + 2), `member-detail/` (the detail page), with `member-labels.ts`, `status-badge.tsx`, `delete-member-dialog.tsx`, and the two `make-member*.fixture.ts` files staying at the root (see PR #149).

Two supporting rules keep the seams clean:

- **Views that outgrow one file split into `parts.tsx` / `sections.tsx` / the view shell.** `parts.tsx` holds small render primitives (value-cell formatters, labelled field rows); `sections.tsx` holds full card/section components that own their own queries; the view file keeps state, early returns (skeleton / not-found / error), and interaction latches. The test file is colocated in the same folder. `member-detail-view.tsx` (387 lines) → `member-detail/` is the worked example.
- **Types and helpers move toward their consumers, not their first user.** A module-wide type that a non-UI layer (`hooks/`, `schemas/`) needs lives at the module root (e.g. `src/modules/members/members-types.ts`), never under `components/` — that reverse seam is forbidden. A helper that two modules need is promoted to `src/shared/lib/<domain>/` (e.g. `format-thai-date.ts` under `dates/`), with its test colocated and its per-module copies deleted.

## Why

- A flat folder of 32 files made the feature boundaries invisible: list / detail / wizard / shared vocab were distinguishable only by filename prefixes, reviews had no structural signal, and unrelated features collided in every diff.
- **Barrels were considered and rejected**: the house style is absolute `src/...` import paths, so an `index.ts` adds an indirection layer and a mock-target ambiguity (`vi.mock` strings) for zero navigation benefit.
- **Prefix-renaming files instead of folders was considered and rejected**: it churns every filename, grows the longest names further, and still leaves a flat folder.
- **One subfolder per single-file feature was rejected**: a feature folder earns its existence when it holds a view + tests or several files; a lone component stays at the root.

## Consequences

- Import rewrites are mechanical (absolute paths, extension-less strings); `vi.mock()` module-ID strings in tests must be rewritten alongside imports or the mocks silently stop applying.
- Like ADR-0022's client/server boundary, this is a **written convention, not a lint rule** — enforced in review. The checkable invariants: no `hooks/`/`schemas/` file imports anything under `components/` except the hoisted module-root types; nothing outside a feature subfolder imports its internals except through its view/export files.
- Other modules with flat `components/` (membership-renewals, organization, dashboard) adopt this shape **incrementally** — when a module mixes features and the flat folder starts hurting — not by a mandated sweep.
- Single-feature folders stay flat; subfolders appear only when the feature split is real.
