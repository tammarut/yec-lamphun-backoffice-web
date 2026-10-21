[UI-02] Org chart — โครงสร้างองค์กร

> **Amendment (2026-10-19, grill session — pre-implementation):** five decisions supersede the original text below. (1) The UI lives in a **new UI-only `organization` module** — `src/modules/organization/components/` + `src/modules/organization/hooks/` — per ADR-0022 (modules own their frontend). *Supersedes, on same-day reconsideration: this session's earlier members-module ruling AND the card's original `src/shared/components/org-chart/` placement (which predates the ADR).* The organization module owns UI only — its endpoints stay members-owned; no cross-module runtime imports (the grid ships its own thin hook; type-only DTO imports from members use-case types are the allowed exception; the members list cache is shared via identical query keys). (2) The tree is a **generic recursive renderer** of whatever `GET /executive-committee` returns — the mockup's three hand-built pillars (ฝ่ายกฎหมาย / คณะที่ปรึกษา / ทีมเลขานุการ) cannot be derived from the position hierarchy (secretary's only seeded child is ผู้ช่วยเลขานุการ; treasurer is a sibling, not a secretary-team member) and are **dropped**; level 2 renders as one column per direct child (~10 columns). The mockup supplies look & feel only (card styling, emphasized president, connectors, dashed vacancies); pixel-perfection is explicitly deferred — iterate later. (3) `GET /api/v1/members` gains a **`position` CSV filter** (backend work rides in this card) so the grid can honestly mean "members not holding committee positions". (4) The grid queries `position=GENERAL_MEMBER&status=ACTIVE,PENDING_RENEWAL,EXPIRED` (the same trio as the committee SQL; RESIGNED never appears on /organization) with a **3-color status dot**: green ACTIVE / amber PENDING_RENEWAL / gray EXPIRED. (5) The committee header badge "N คน" is client-derived (count of filled tree nodes); the **general-members count badge is dropped** — the keyset response carries no total, and โหลดเพิ่มเติม already communicates "more exist". (6) The route is **`/organization`** — the full word, not card-00's stub `/org`; implementation renames the existing stub route and updates the sidebar nav entry (the only two live `/org` references in code; card-00's doc keeps its historical text).

## Goal

The organizational structure page at `/organization`: an executive-committee tree (the president plus whatever positions the hierarchy defines — departments and standalone roles alike) and a general-members grid of `GENERAL_MEMBER` holders only (see amendment), all from real data — including vacant positions.

## Route & files

- `src/app/(public)/organization/page.tsx` — thin re-export of the view (dashboard / PR #98 pattern). RENAMED from card-00's `/org` stub (amendment ruling 6): move the stub directory and update the sidebar nav entry.
- `src/modules/organization/components/` — view + tree components: `org-chart-view.tsx`, `org-tree.tsx` (generic recursive renderer + connector CSS), `person-card.tsx`, `general-members.tsx`. A **UI-only module** (2026-10-19 reconsideration — supersedes both the original ~~`src/shared/components/org-chart/`~~ placement (pre-ADR-0022) and the same session's first-pass members-module home): endpoints stay members-owned; no cross-module runtime imports — type-only DTO imports allowed, cache shared via identical query keys.
- `src/modules/organization/hooks/use-executive-committee.ts` (mirrors `use-dashboard-stat.ts`) + `use-organization-members.ts` (own infinite query on the keyset cursor — pattern-copied from the members list hook, not imported).
- Connector styles: small custom CSS (borders via Tailwind or a tiny globals addition) — this is the one page expected to need custom layout CSS.

## API contract

- `GET /api/v1/members/executive-committee` — public. Positions-derived tree with `children`, vacant-position placeholder nodes (`id: null`), `null` at the root when no president exists, ordered by `display_order`. Read the exact node shape in `src/app/api/v1/members/executive-committee/route.ts` and its service/DTO. Unchanged.
- `GET /api/v1/members` — public, keyset pagination (`limit`/`cursor`). Feeds the general-members grid; load more via cursor.
  - **New in this card (2026-10-19 amendment): a `position` CSV filter** (e.g. `?position=GENERAL_MEMBER`), mirroring the existing `status` CSV pattern end to end — `list-schema.ts` raw-CSV field, route split/trim/drop-empties, keyset fragment in the repository, route tests, and the Apidog spec. Recommendation recorded: an unknown position code matches no rows (**200 with empty `data`**, not 400) — position codes are DB data (`positions.code`), not a closed enum.
  - The org grid calls it as `?position=GENERAL_MEMBER&status=ACTIVE,PENDING_RENEWAL,EXPIRED` (see amendment).

## UI structure (from mockup)

Mockup: `OrgChart` component, `ui-mockup/YEC-Lamphun.html` lines **371–518** (content unchanged since v1 — only line-shifted; the original ~347 citation was stale).

- Card 1 — คณะกรรมการบริหาร (Executive Committee):
  - Top: president (ประธาน) card, visually emphasized (ring/scale, mockup's `scale-110` + `ring-4`).
  - ~~Second row: ฝ่ายกฎหมาย (legal), คณะที่ปรึกษา (advisors), ทีมเลขานุการ (secretary team: เลขาธิการ, ผู้ช่วยเลขานุการ, เหรัญญิก, ผู้ประสานงาน)~~ — dropped by the 2026-10-19 amendment: this grouping cannot be derived from the position hierarchy. Instead, a **generic recursive renderer**: every direct child of the root renders as its own column — label pill = the position's Thai name from the data, holder card(s) beneath, deeper descendants stacked below (the mockup's department-column treatment applied uniformly). Level 2 is ~10 columns (advisory, secretary + ผู้ช่วยเลขานุการ, treasurer, legal, 6×รองประธานฝ่าย departments); the mockup's own `min-w-[1200px]` + horizontal scroll absorbs the width.
  - Department columns keep the mockup's inner shape where the data provides it: head card (รองประธานฝ่าย) with stacked กรรมการฝ่าย mini-cards.
  - Person card: avatar, name + nickname, position, business/department.
  - Vacant placeholder nodes (`id: null`) render as a dashed muted card carrying the position title — same visual language as the mockup's ยังไม่มีประธาน box (and per CONTEXT.md, vacancies never materialize for the root).
  - Header count badge "N คน" = client-side count of filled (non-vacant) tree nodes (see amendment).
  - Connector lines between levels (mockup's `.org-connector-v/h`, CSS at mockup lines 43/48).
- Card 2 — สมาชิกทั่วไป (General Members): responsive chip grid — avatar, name + nickname, business — with a **3-color status dot**: green ACTIVE / amber PENDING_RENEWAL / gray EXPIRED (see amendment; RESIGNED members never reach this page). Subtitle stays mockup-verbatim: รายชื่อสมาชิกที่ไม่ได้ดำรงตำแหน่งในคณะกรรมการ — made true by the `position` filter. ~~Count badge~~ — dropped by the 2026-10-19 amendment (keyset has no total). "โหลดเพิ่มเติม" load-more (cursor; mockup-invisible but required by keyset pagination — reuse the members-page load-more pattern/copy).

## shadcn components to add

~~`bunx shadcn@latest add avatar skeleton`~~ — none needed; both `avatar` and `skeleton` already exist in `src/shared/components/ui/` (stale since card 03).

## Task breakdown

### 0. Backend: `position` CSV filter on `GET /api/v1/members` (2026-10-19 amendment)

- Add `position` as a raw CSV string field to `GetListMembersQuerySchema` (`list-schema.ts`), mirroring `status` semantics exactly: route splits, trims, drops empties; absent/empty → no filter.
- Thread it through the route handler into the repository keyset query (alongside the existing status filter in the keyset fragment).
- Unknown position code → matches no rows → 200 with empty `data` (not 400).
- Route tests mirroring the status-filter cases; Apidog spec + `docs/openapi/` re-export sync.

### 1. Structure & layout

- Tree renders from the API's actual hierarchy via a **generic recursive renderer** — don't hardcode departments or pillar groupings; the tree shape comes from data (positions + `display_order`). See amendment.
- Horizontally scrollable tree area on small screens (min-width container).
- Connectors: CSS borders between levels; keep it simple and symmetric.

### 2. API/data integration

- `useExecutiveCommittee()` query (new hook in the organization module, mirrors `use-dashboard-stat.ts`).
- General-members grid: the organization module's **own** `useInfiniteQuery` hook on the keyset cursor calling `GET /api/v1/members?position=GENERAL_MEMBER&status=ACTIVE,PENDING_RENEWAL,EXPIRED` (own hook — cross-module import of the members `useMembers` hook is banned; reuse its pattern, type-only import its DTO types, share cache via identical query keys).

### 3. States

- Loading: skeleton tree (a few gray card blocks) + skeleton grid.
- President missing (`null` root): the API models this — show the mockup's empty state ยังไม่มีประธาน in the president slot.
- General members empty: ไม่มีข้อมูลสมาชิกทั่วไป.
- Error: inline alert + retry per card (two independent queries).
- Success: full tree; vacant nodes styled distinctly; load-more appends.

### 4. Responsive

- 375px: tree scrolls horizontally; grid 2-col chips; 768px+: wider grid; desktop: full tree.

### 5. Validation & tests

- Route tests for the `position` filter: valid CSV filters results; empty/absent → no filter; unknown code → 200 empty `data`.
- Component tests with mocked queries: renders president + columns from a fixture (generic shape, not mockup pillars); renders vacant placeholder when `id: null`; renders ยังไม่มีประธาน when root is `null`; empty-grid state; 3-color dot mapping.

## Out of scope

- Clicking a person for a profile page/detail; editing the org structure (admin CRUD lives in card 03); search on this page; a total-count source for the general-members badge (dropped, see amendment); pixel-perfect mockup-pillar layout (deferred, see amendment).

## Acceptance criteria

- [ ] Tree renders entirely from `GET /executive-committee` via a generic recursive renderer — shape follows data, no hardcoded positions or pillar groupings.
- [ ] Vacant placeholders and the no-president state render correctly.
- [ ] `GET /api/v1/members` accepts a `position` CSV filter (route-tested; unknown code → 200 empty).
- [ ] General-members grid queries `position=GENERAL_MEMBER` + the status trio, shows the 3-color dot, and paginates via cursor load-more; committee badge shows the filled-node count; no general-members count badge.
- [ ] All four states reachable; tree scrolls horizontally on mobile.
- [ ] Component + route tests pass; `bun run lint` + `bun test` green.

## AI implementation prompt

```text
Implement Trello card [UI-02] Org chart in this repo.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Executive Committee, General Member,
   Vacant Position, positions).
2. The card: docs/ui-conversion/cards/02-org-chart.md — including the
   2026-10-19 amendment blockquote; it supersedes stale sections below it.
3. Mockup: ui-mockup/YEC-Lamphun.html, OrgChart component (lines 371–518) —
   look & feel reference only; its pillar grouping is NOT reproducible from
   data and is dropped (see amendment).
4. API: src/app/api/v1/members/executive-committee/route.ts + its service
   (node shape, vacant placeholders id:null, null-when-no-president,
   display_order) and src/app/api/v1/members/route.ts + list-schema.ts +
   members.repository.ts (keyset list; you will ADD the position CSV filter
   there, mirroring status end to end).
5. ADR-0020 for the tree's derivation rules; ADR-0022 for module-owned
   frontend.

Scope: /organization page content only — shell/providers exist (card 00).
In scope: position CSV filter on GET /api/v1/members (schema + route + repo
keyset fragment + route tests; unknown code → 200 empty data, not 400);
generic recursive exec tree from real data (president, one column per root
child, vacant placeholders, connectors); general-members grid
(position=GENERAL_MEMBER + status=ACTIVE,PENDING_RENEWAL,EXPIRED) with
3-color status dot and cursor load-more; committee count badge from filled
tree nodes; all four states; component + route tests; route rename of the
/org stub to /organization + sidebar nav href update.
UI lives in a NEW UI-only module src/modules/organization/ (components/ +
hooks/) — its endpoints stay members-owned; no cross-module runtime imports
(ship the grid's own thin hook; type-only members DTO imports allowed; share
the members list cache via identical query keys); the /organization page is a
thin re-export.
Out of scope: profile pages, org editing, search, general-members count
badge, pixel-perfect pillar layout.

Constraints:
- The tree's shape comes from the API response — never hardcode departments
  or pillar groupings.
- TanStack Query (useInfiniteQuery for the members grid); { error_message }.
- Semantic OKLCH tokens; cn(); data-slot; tabs indentation; src/ imports.
- Thai copy from the mockup.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas for every endpoint). The `position` filter requires an Apidog spec + re-export update (see task 0).

- Mockup: `OrgChart` — `ui-mockup/YEC-Lamphun.html` lines 371–518; connector CSS `.org-connector-v/h` at lines 43/48.
- `src/app/api/v1/members/executive-committee/`; `src/modules/members/`; ADR-0020; ADR-0022.
