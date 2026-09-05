[UI-02] Org chart — โครงสร้างองค์กร

## Goal

The organizational structure page at `/org`: an executive-committee tree (president, secretary team, advisors, legal, departments) plus a general-members grid, all from real data — including vacant positions.

## Route & files

- `src/app/org/page.tsx`.
- `src/shared/components/org-chart/` — tree components: `org-tree.tsx` (layout + connector CSS), `person-card.tsx`, `general-members.tsx`.
- Connector styles: small custom CSS (borders via Tailwind or a tiny globals addition) — this is the one page expected to need custom layout CSS.

## API contract

- `GET /api/v1/members/executive-committee` — public. Positions-derived tree with `children`, vacant-position placeholder nodes (`id: null`), `null` at the root when no president exists, ordered by `display_order`. Read the exact node shape in `src/app/api/v1/members/executive-committee/route.ts` and its service/DTO.
- `GET /api/v1/members` — public, keyset pagination (`limit`/`cursor`). Feeds the general-members grid; load more via cursor.

## UI structure (from mockup)

Mockup: `OrgChart` component, `ui-mockup/YEC-Lamphun.html` ~line 347.

- Card 1 — คณะกรรมการบริหาร (Executive Committee):
  - Top: president (ประธาน) card, visually emphasized (ring/scale).
  - Second row: ฝ่ายกฎหมาย (legal), คณะที่ปรึกษา (advisors), ทีมเลขานุการ (secretary team: เลขาธิการ, ผู้ช่วยเลขาธิการ, เหรัญญิก, ผู้ประสานงาน).
  - Departments row: one column per ฝ่าย — head card (รองประธานฝ่าย) with stacked กรรมการฝ่าย mini-cards; per-column count badge ("N คน").
  - Person card: avatar, name + nickname, position, business/department.
  - Vacant placeholder nodes render as a muted "ตำแหน่งว่าง"-style card (derive wording from the API's vacant representation).
  - Connector lines between levels (mockup's `.org-connector-v/h`).
- Card 2 — สมาชิกทั่วไป (General Members): responsive chip grid (avatar with Active/Inactive status dot, name, business) + count badge + "โหลดเพิ่มเติม" load-more (cursor).

## shadcn components to add

`bunx shadcn@latest add avatar skeleton` (rest exists).

## Task breakdown

### 1. Structure & layout

- Tree renders from the API's actual hierarchy — don't hardcode departments; the tree shape comes from data (positions + `display_order`).
- Horizontally scrollable tree area on small screens (min-width container).
- Connectors: CSS borders between levels; keep it simple and symmetric.

### 2. API/data integration

- `useExecutiveCommittee()` query; `useMembers({ cursor })` infinite-style query for general members (`useInfiniteQuery` fits the keyset cursor).

### 3. States

- Loading: skeleton tree (a few gray card blocks) + skeleton grid.
- President missing (`null` root): the API models this — show the mockup's empty state ยังไม่มีประธาน in the president slot.
- General members empty: ไม่มีข้อมูลสมาชิกทั่วไป.
- Error: inline alert + retry per card (two independent queries).
- Success: full tree; vacant nodes styled distinctly; load-more appends.

### 4. Responsive

- 375px: tree scrolls horizontally; grid 2-col chips; 768px+: wider grid; desktop: full tree.

### 5. Validation & tests

- Component tests with mocked queries: renders president + departments from a fixture; renders vacant placeholder when `id: null`; renders ยังไม่มีประธาน when root is `null`; empty-grid state.

## Out of scope

- Clicking a person for a profile page/detail; editing the org structure (admin CRUD lives in card 03); search on this page.

## Acceptance criteria

- [ ] Tree renders entirely from `GET /executive-committee` — shape follows data, no hardcoded positions.
- [ ] Vacant placeholders and the no-president state render correctly.
- [ ] General-members grid paginates via cursor load-more.
- [ ] All four states reachable; tree scrolls horizontally on mobile.
- [ ] Component tests pass; `bun run lint` + `bun test` green.

## AI implementation prompt

```text
Implement Trello card [UI-02] Org chart in this repo.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Executive Committee, positions).
2. The card: docs/ui-conversion/cards/02-org-chart.md.
3. Mockup: ui-mockup/YEC-Lamphun.html, OrgChart component (~line 347) —
   structural reference only.
4. API: src/app/api/v1/members/executive-committee/route.ts + its service
   (node shape, vacant placeholders id:null, null-when-no-president,
   display_order) and src/app/api/v1/members/route.ts (keyset list).
5. ADR-0020 for the tree's derivation rules.

Scope: /org page content only — shell/providers exist (card 00).
In scope: exec tree from real data (president, secretary team, advisors,
legal, department columns, vacant placeholders, connectors), general-members
grid with cursor load-more, all four states, component tests.
Out of scope: profile pages, org editing, search.

Constraints:
- The tree's shape comes from the API response — never hardcode departments.
- TanStack Query (useInfiniteQuery for the members grid); { error_message }.
- Semantic OKLCH tokens; cn(); data-slot; tabs indentation; src/ imports.
- Thai copy from the mockup.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas for every endpoint).

- Mockup: `OrgChart` — `ui-mockup/YEC-Lamphun.html` ~lines 347–495.
- `src/app/api/v1/members/executive-committee/`; `src/modules/members/`; ADR-0020.
