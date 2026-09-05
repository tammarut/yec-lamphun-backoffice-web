[UI-01] Dashboard — หน้าหลัก

## Goal

The landing overview at `/dashboard`: headline stat cards, a members-per-year chart from real data, a member-search CTA, and the contact card.

## Route & files

- `src/app/dashboard/page.tsx` — page composition (can be a thin server wrapper around a client component).
- `src/shared/components/dashboard/` (or `src/modules/dashboard/…` if it grows domain logic — keep it presentational here) — stat-cards, member-chart, contact-card components.
- Root layout already provides the shell + providers (card 00).

## API contract

- `GET /api/v1/dashboard/stat` — public; optional `lookback_years` (1..20, default 5). Returns the five headline counts + per-year joined counts. Source of truth for field names: `src/app/api/v1/dashboard/stat/route.ts` and the dashboard module's service/response DTO (`src/modules/dashboard/`). The mockup shows 4 KPI cards — render what the API actually returns (5 counts), mapping mockup labels where they exist.

## UI structure (from mockup)

Mockup: `Dashboard` component, `ui-mockup/YEC-Lamphun.html` ~line 168.

- Row of KPI stat cards: สมาชิกทั้งหมด (total members), จำนวนกิจการ (unique businesses), สมาชิก Active, ยังไม่ได้ต่ออายุ (pending renewal) — plus whatever the fifth count is, per the API.
- Search promo banner "ตรวจสอบสมาชิก" with button ค้นหาสมาชิก → navigates to `/members` (`useRouter`).
- Chart card: "จำนวนสมาชิกในแต่ละปี (ย้อนหลัง 5 ปี)" — line/area chart of per-year counts, x-axis labels in Buddhist Era (year + 543).
- Contact channels card: Facebook Page (facebook.com/yeclamphun), LINE Official (@yeclamphun), address สำนักงานหอการค้าจังหวัดลำพูน, phone 053-510-686.

## shadcn components to add

None beyond card 00's set — uses `card`, `button`, `badge`, `skeleton`. New dep: `bun add recharts`.

## Task breakdown

### 1. Structure & layout

- Page grid: KPI row (responsive 1→2→4+ cols), then chart card (2/3 width) + contact card (1/3) side by side on desktop, stacked on mobile.

### 2. API/data integration

- `useDashboardStat()` TanStack Query hook; single fetch feeds KPIs and chart.
- Buddhist-Era label helper: `year + 543` (e.g. `2569`), display-only.

### 3. States

- Loading: skeleton cards + skeleton chart block.
- Empty (no per-year data): chart area shows muted "ไม่มีข้อมูล" placeholder; KPIs show 0.
- Error: inline `alert` with รีเฟรช button retrying the query; `error_message` from the API surfaced.
- Success: full render; recharts `ResponsiveContainer` keeps the chart fluid.

### 4. Responsive

- KPI cards stack 1-col at 375px, 2-col at 768px, ≥4-col desktop; chart/contact stack vertically below 1024px.

### 5. Validation & tests

- Component test with a mocked query client: renders KPI values from a fixture; renders the empty state when counts are zero; shows error alert when the query fails.

## Out of scope

- **Admin chart-edit modal** — the mockup's pencil/edit-numbers modal has no write API; the chart is strictly read-only (README §8 item 2).
- Any other dashboard settings.

## Acceptance criteria

- [ ] KPI cards render all counts returned by the API with Thai labels.
- [ ] Chart renders per-year data with BE-year x labels; responsive.
- [ ] ค้นหาสมาชิก CTA navigates to `/members`.
- [ ] Contact card shows all four channels incl. phone 053-510-686.
- [ ] All four states reachable; skeleton while loading; retry works on error.
- [ ] Component tests pass; `bun run lint` + `bun test` green.

## AI implementation prompt

```text
Implement Trello card [UI-01] Dashboard in this repo.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Dashboard Stat).
2. The card: docs/ui-conversion/cards/01-dashboard.md.
3. Mockup: ui-mockup/YEC-Lamphun.html, Dashboard component (~line 168) —
   structural reference only.
4. API: src/app/api/v1/dashboard/stat/route.ts + the dashboard module's
   response DTO — field names there are the source of truth.
5. ADR-0019 (docs/adr/) for the stat's semantics.

Scope: /dashboard page content only — the shell/providers exist (card 00).
In scope: KPI cards, recharts members-per-year chart (BE-year labels +543),
search CTA to /members, contact card, all four states, component test.
Out of scope: admin chart-edit modal (no API — read-only chart), any writes.

Constraints:
- TanStack Query for fetching; errors are { error_message }.
- Add recharts via bun add. Use semantic OKLCH tokens; cn(); data-slot;
  tabs indentation; src/ imports. Thai copy from the mockup.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas for every endpoint).

- Mockup: `Dashboard` — `ui-mockup/YEC-Lamphun.html` ~lines 168–346.
- `src/app/api/v1/dashboard/stat/route.ts`; `src/modules/dashboard/`; ADR-0019.
- README §8 gap ledger item 4 (phone discrepancy — keep 053-510-686 here).
