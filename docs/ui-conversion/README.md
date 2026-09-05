# UI Mockup → Production Pages — Action Plan

Convert the client-approved mockup `ui-mockup/YEC-Lamphun.html` into production Next.js pages, one Trello card per page, implemented incrementally with AI assistance.

- **Source of structure**: the mockup. Structural similarity is the goal — pixel-perfection is explicitly not.
- **Source of truth for behavior/data**: the existing tested API routes under `src/app/api/v1/`. Where the mockup and the API disagree, the API wins.
- **Stack**: Next.js App Router + React 19 + Tailwind v4 + shadcn/ui (`radix-nova` style) + TanStack Query + react-hook-form + valibot.

## 1. Locked decisions (do not re-litigate per card)

1. **Data fetching**: client components + TanStack Query calling the JSON APIs. No server-component service resolution for page data.
2. **Admin auth UX**: modal, like the mockup. Sidebar gear → login dialog → admin controls unlock in place. All pages stay publicly viewable (matching the public GET APIs).
3. **Cards live in** `docs/ui-conversion/cards/` as markdown; paste each into Trello when you start it.
4. **Wayfinder check**: with the above decided, no decision-fog remains — the way is clear, so no separate decision map is maintained. This README + the card set is the map.

## 2. Card map & order

| Card | Title | Blocks | Notes |
| --- | --- | --- | --- |
| [UI-00](cards/00-app-shell-and-admin-session.md) | App shell, routing & admin session | 01–04 | Foundation. Do this first, in full. |
| [UI-01](cards/01-dashboard.md) | Dashboard | — | Any time after 00. |
| [UI-02](cards/02-org-chart.md) | Org chart | — | Any time after 00. |
| [UI-03](cards/03-members.md) | Members | — | Before 04 (04 reuses its patterns). **Split executed as two PRs**: 3a list/card + delete + CSV (branch `feature/ui-03a-members-list`, PR = part 1 of #41), 3b add/edit wizard (branch `feature/ui-03b-*` off main after 3a merges; PR closes #41). |
| [UI-04](cards/04-membership-renewal.md) | Membership renewal | — | Last. Reuses autocomplete + upload patterns from 03. |

## 3. Per-card workflow (mockup → production → tested)

One card = one branch = one PR = one (or two) AI sessions.

1. **Prepare** — paste the card into Trello, move to Doing, create branch `feature/ui-0x-<slug>`.
2. **Read before writing code** — the card's *References* section lists exactly what to read: the mockup component (structure only), the API route files (real contract), CONTEXT.md terms, and ADRs.
3. **Scaffold** — create the route/page and wire it into the sidebar nav from card 00. Landing on the route with an empty shell is the first commit.
4. **Data** — TanStack Query hooks + typed fetch wrapper; confirm response field names against the route's response mapping (the card lists the file).
5. **Render all four states** — loading (skeleton), empty, error (inline message + retry), success. A page isn't reviewable until all four exist.
6. **Interactivity** — search/filters/modals/forms/admin actions, in that order.
7. **Responsive pass** — verify 375px (sidebar drawer, stacked layouts), 768px, ≥1280px.
8. **Tests** — colocated `.test.tsx` component tests with mocked query layer (see §6 conventions).
9. **Verify & PR** — `bun run lint` + `bun test` green, walk the card's acceptance criteria, open a PR against the checklist.

## 4. Environment prep (one-time, part of card 00)

1. **Fix `components.json` aliases** so the shadcn CLI writes to the real locations (current aliases point at non-existent `src/components`):

   ```json
   "aliases": {
     "components": "src/shared/components",
     "utils": "src/shared/lib/utils/utils",
     "ui": "src/shared/components/ui",
     "lib": "src/shared/lib",
     "hooks": "src/shared/hooks"
   }
   ```

   After every `bunx shadcn@latest add <component>`, check the generated imports resolve (they should import `cn` from `src/shared/lib/utils/utils`) and that file placement matches the existing 13 primitives in `src/shared/components/ui/` (alert-dialog, badge, button, card, combobox, dropdown-menu, field, input, input-group, label, select, separator, textarea).

2. **New dependencies allowed**: `recharts` (dashboard chart, card 01), `sonner` (toasts, card 00). TanStack Query, react-hook-form, and `@hookform/resolvers` are already installed. Do not add axios/SWR/date libs — use `fetch` and native `Date`.
3. **Root layout gains**: `QueryClientProvider` (client provider component) + sonner `<Toaster />` + Thai metadata (title `ระบบบริหารจัดการองค์กร - YEC Lamphun`).

## 5. Trello card template

Each card file follows this shape (paste the file body into the Trello description; keep the `[UI-0x]` prefix in the card title):

```markdown
[UI-0x] <Page name (Thai)> — <slug>

## Goal
One sentence: what exists when this card is done.

## Route & files
The route to create and every file expected to be touched/created.

## API contract
Every endpoint used: method, path, auth (public/admin), query params, and the
source file to read for the exact response shape.

## UI structure (from mockup)
Region-by-region breakdown of the page, citing the mockup component name —
structural reference only.

## shadcn components to add
`bunx shadcn@latest add …` list, beyond the 13 existing primitives.

## Task breakdown
### 1. Structure & layout
### 2. API/data integration
### 3. States (loading / empty / error / success)
### 4. Responsive
### 5. Validation & tests

## Out of scope
Explicit non-goals so the AI session doesn't wander.

## Acceptance criteria
- [ ] …checkboxes…

## AI implementation prompt
A ready-to-paste prompt block (see §6) tailored to this card.

## References
Mockup component + line range, ADRs, domain files, CONTEXT.md terms.
```

## 6. Writing AI implementation prompts

Rules that make a card-level prompt work:

- **One card per session.** Never "do cards 01 and 02". If a card is too big (03), split the session: list view first, wizard second.
- **Point at files, don't paste code.** The AI can read the repo; naming `src/app/api/v1/members/route.ts` beats pasting its contents.
- **State the contract, not the vibe**: name the endpoints, the error-body shape `{ error_message }`, and where response field names are defined.
- **Declare non-goals** (from the card's Out of scope) — this is the #1 defense against scope creep.
- **Demand verification**: end every prompt with `bun run lint` + `bun test` and a walk of the acceptance criteria.

Universal prompt skeleton (the card's *AI implementation prompt* section fills the ⟨brackets⟩):

```text
Implement Trello card [UI-0x] ⟨title⟩ in this repo.

Read first, in order:
1. AGENTS.md — architecture law (DI, neverthrow, valibot, import rules, testing).
2. CONTEXT.md — domain glossary; use these terms for naming.
3. The card: docs/ui-conversion/cards/⟨0x-file⟩.md — follow its task breakdown.
4. Mockup: ui-mockup/YEC-Lamphun.html, component ⟨Name⟩ (~line N) — structural
   reference ONLY; colors/spacing/typography follow the repo's Tailwind v4
   semantic tokens, not the mockup.
5. API contract: ⟨route files + schema files⟩ — the response mapping there is
   the source of truth for field names.
6. ADRs: ⟨list⟩.

Scope: ⟨one line⟩. In scope: ⟨…⟩. Out of scope: ⟨from card⟩.

Constraints:
- shadcn/ui primitives first (src/shared/components/ui); add missing ones with
  `bunx shadcn@latest add ⟨names⟩` (components.json aliases are pre-fixed).
- All fetching via TanStack Query; error bodies are { error_message: string }.
- Tailwind semantic OKLCH tokens only — no hex, no arbitrary colors. Use cn()
  for class merging; add data-slot to component wrappers.
- Tabs for indentation; absolute `src/…` imports; React 19 component props.
- Thai UI copy comes from the mockup component.
- Colocated tests (.test.tsx), describe blocks split Happy/Unhappy cases.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Finish by walking the acceptance criteria one by one.
```

## 7. Definition of Done — every page card

- [ ] `bun run lint` clean and `bun test` green (including new `.test.tsx`).
- [ ] Route reachable from the sidebar; active-nav state correct; `/` still redirects to `/dashboard`.
- [ ] **All four states implemented and reachable**: loading skeleton, empty state, error with retry, success render.
- [ ] Responsive verified at 375px / 768px / ≥1280px (mobile uses the sidebar drawer).
- [ ] Thai copy matches the mockup's wording for that component.
- [ ] Only semantic tokens used (`text-muted-foreground`, `bg-card`, …) — zero hardcoded colors.
- [ ] Keyboard accessible: dialogs trap focus, ESC closes, all inputs labelled (Radix primitives give most of this free — don't fight them).
- [ ] Public view and admin view both verified (admin-only controls hidden when logged out).
- [ ] API failures surface as sonner toasts or inline alerts — never swallowed, never `console.log`-only.
- [ ] No new lint suppressions; no `any` escapes; no relative imports across folders.
- [ ] PR description walks the acceptance criteria; branch rebased on `main`.

## 8. Known gaps & out-of-scope ledger

Decisions already made so cards don't re-open them:

1. **New tiny endpoint `GET /api/v1/auth/session`** (card 00) — 204 when the `session_id` cookie is valid, 401 otherwise. Needed so admin mode survives page refresh. Follows the existing route + `route.test.ts` patterns.
2. **Dashboard chart-edit modal is OUT** — the mockup lets admins hand-edit chart numbers, but `GET /api/v1/dashboard/stat` computes real data and there is no write API. The chart is read-only.
3. **Bulk status change = sequential `PATCH`es** — no bulk endpoint exists; loop over selected members, then toast a summary (N ok / M failed).
4. **Phone number discrepancy in the mockup** — Dashboard contact card says 053-510-686, renewal closed-state says 053-511-168. Keep each page exactly as its mockup section shows for now; confirm the right number with the client before launch.
5. **PDPA consent text + fee amounts are static copy** from the mockup. The only system setting that exists is `open_membership_renewal`. Fee/discount config and legal-reviewed PDPA text are future work, not card scope.
6. **`rememberMe` on login is not surfaced** in the UI (mockup has no such checkbox) even though the API accepts it. Fine to add later.
7. **The mockup file itself is untracked** — do not delete `ui-mockup/YEC-Lamphun.html`; it is the structural reference for every card. (Landed in git with the UI-03a PR.)
8. **Member status is never written from the members UI** — the mockup's bulk ปรับเป็นยังไม่ได้ต่ออายุ / ปรับเป็นปกติ buttons and the wizard's status toggle are dropped. `PATCH /api/v1/members/[id]` has no `status` field by design — Member Status is a lifecycle column owned by the renewal flow (update-member service preserves it; see CONTEXT.md *Renewal Cache Columns*). Status changes reach a member only via Renewal Review or a Manual Renewal Submission (card 04 UI). Display vocabulary (incl. `RESIGNED` → ลาออก) is the Status Badge term in CONTEXT.md; badges are staff-only, matching the mockup.
9. **Card 03 edit-wizard gap (3b prerequisite)** — `PATCH` requires a 13-digit `id_card_no`, but `GET /api/v1/members/[id]` returns only the Masked ID Card, and ADR-0012 null-stickiness covers only the five file-path fields. As-is, an edit cannot be saved without the admin re-typing the full ID number (echoing the masked value fails the 13-digit check with 400). Recommended fix for the 3b session: extend null-sticky semantics to `id_card_no` (`null` = keep existing) — schema, service, tests, OpenAPI + Apidog re-export — before building the edit form.

## 9. Quick reference — API → page map

**Full API documentation:** `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` — Apidog export (OpenAPI 3.1, 18 paths) with request/response schemas for every endpoint below. Added 2026-09-05.

| Page | Endpoints |
| --- | --- |
| Shell/admin (00) | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, **new** `GET /api/v1/auth/session` |
| Dashboard (01) | `GET /api/v1/dashboard/stat` (`lookback_years`, default 5) |
| Org chart (02) | `GET /api/v1/members/executive-committee`, `GET /api/v1/members` (keyset) |
| Members (03) | `GET/POST /api/v1/members`, `GET/PATCH/DELETE /api/v1/members/[id]`, `POST /api/v1/members/file/upload`, `GET /api/v1/business/categories` |
| Renewal (04) | `GET/POST /api/v1/membership/renewals`, `POST …/renewals/manual`, `PATCH …/renewals/review/[renewal_id]`, `GET …/renewals/[member_id]`, `GET …/renewals/expired`, `GET …/renewals/stat`, `GET/PATCH /api/v1/system-settings` |

Shared facts: error body is always `{ error_message: string }`; member-file multipart field names are `id_card_image`, `company_certificate`, `profile_avatar`, `business_logo`, `business_product`, `payment_slip` (`src/modules/members/member-file.constants.ts`); position & shirt-size enums are exported from `src/app/api/v1/members/schema.ts` (`PositionSchema.options`, `ShirtSizeSchema.options`); the renewal toggle setting key is `open_membership_renewal`.
