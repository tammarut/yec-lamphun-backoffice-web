[UI-03] Members — รายชื่อสมาชิก

## Goal

The member directory at `/members`: searchable list/card views with server-side cursor paging, admin delete confirmation, selection-based CSV export (3a), and a 3-tab add/edit wizard dialog (3b).

## Scope split (executed)

The largest card, split into two PRs (see README §2):

- **3a — list view** (branch `feature/ui-03a-members-list`, PR = *part 1 of #41*): toolbar (search + view toggle), table + card grid, cursor load-more, admin selection + bulk bar with Export CSV, delete confirmation, all four list states, responsive, component tests. The admin จัดการ column renders **delete only** in 3a; the edit action arrives with the wizard.
- **3b — add/edit wizard** (branch off main after 3a merges, PR closes #41): the เพิ่มสมาชิก button, the edit action in จัดการ, and the 3-tab wizard dialog with file uploads. Blocked on the `id_card_no` PATCH gap (README §8 item 9) — extend null-sticky to `id_card_no` first, else every edit forces re-typing the full ID number.

**Dropped from the card** (README §8 item 8): the mockup's bulk status buttons (ปรับเป็นยังไม่ได้ต่ออายุ / ปรับเป็นปกติ) and the wizard's Tab-2 status toggle. `PATCH /api/v1/members/[id]` cannot write `status` by design — Member Status is owned by the renewal flow (card 04). The bulk bar therefore carries only the selection count and Export CSV.

## Route & files

- `src/app/members/page.tsx`.
- `src/shared/components/members/` — `members-view.tsx` (toolbar + views), `members-table.tsx`, `members-card-grid.tsx`, `member-wizard-dialog.tsx` (+ its three step forms, **3b**), `delete-member-dialog.tsx`, `bulk-actions-bar.tsx`.
- Client-side valibot schemas mirroring the server contract — put them in `src/modules/members/` only if they become shared domain logic; otherwise colocate with the wizard.

## API contract

> **Full API documentation:** `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` — Apidog export (OpenAPI 3.1) with request/response schemas for every endpoint below. Where this card and the code disagree, the code + this spec win.

- `GET /api/v1/members` — public. Query: `search` (prefix ILIKE on `first_name_th` OR `phone_no` OR `position_code` — the position match is on the stored English code), `status` (CSV of `ACTIVE|EXPIRED|PENDING_RENEWAL|RESIGNED`), `sort_by` (`created_at|first_name_th|expires_at`), `sort_order`, `limit` (1..50, default 10; UI uses 20), `cursor`. Response rows are snake_case (`profile_avatar`, `title_name_th`, `first_name_th`, `last_name_th`, `nickname`, `phone_no`, `email`, `line_id`, `position` = raw position **code**, `status`, `business: { name, description }`); envelope `{ data, has_more, next_cursor }`. No default status filter — `RESIGNED` members are returned. Source: `src/app/api/v1/members/route.ts` (response mapping) + `list-schema.ts`.
- `GET /api/v1/members/[id]` — **admin** (withAuth). Detail incl. masked ID card + resolved file URLs. Used to populate the edit wizard (**3b**).
- `POST /api/v1/members` — admin. Create (**3b**); source: `schema.ts` (the exact payload incl. how uploaded file paths attach).
- `PATCH /api/v1/members/[id]` — admin. Hybrid null-sticky update (ADR-0012) — **has no `status` field and never will** (README §8 item 8); **3b prerequisite:** extend null-sticky to `id_card_no` (README §8 item 9).
- `DELETE /api/v1/members/[id]` — admin. Cascade soft-delete, idempotent 204 (ADR-0013).
- `POST /api/v1/members/file/upload` — public multipart. Field names (exactly six): `id_card_image`, `company_certificate`, `profile_avatar`, `business_logo`, `business_product`, `payment_slip` — `src/modules/members/member-file.constants.ts` (**3b**).
- `GET /api/v1/members/file/presign` — **admin**. Re-mints a temporary (1-hour) view URL for a private file path when a URL resolved by `GET [id]` has expired (**3b**).
- `GET /api/v1/business/categories` — public. Feeds the category select (**3b**).

## UI structure (from mockup)

Mockup: `MemberSystem` component, `ui-mockup/YEC-Lamphun.html` ~line 496.

- Toolbar: heading รายชื่อสมาชิก; search input (placeholder "ค้นหาชื่อจริง, เบอร์โทร หรือรหัสตำแหน่ง..." + title tooltip explaining prefix matching — deliberate deviation from the mockup's "ค้นหาชื่อ, ตำแหน่ง...", which over-promised: the API prefix-matches `first_name_th`/`phone_no`/`position_code` only, so no last name and no Thai position label; server-side, debounced ~300ms); list/card view toggle; admin-only **Export CSV** button (lives in the toolbar, not the bulk bar, so it stays reachable with nothing selected); admin-only เพิ่มสมาชิก button (**3b** — hidden in 3a; it only opens the wizard).
- Bulk bar (admin, when rows selected): "เลือกแล้ว N รายการ". (Export moved to the toolbar; status buttons dropped — see Scope split.)
- Table columns: [admin checkbox] · ชื่อ-สกุล/ตำแหน่ง (avatar + admin-only status badge + `${title_name_th}${first_name_th} ${last_name_th}` + (nickname) + Thai position label) · ธุรกิจ/กิจการ (`business.name`) · รายละเอียดธุรกิจ (`business.description`) · ติดต่อ (phone/email/LINE ID) · [admin] จัดการ (delete in 3a; edit added in 3b).
- Card view: responsive grid (1/2/3/4 cols) of member cards (avatar, name+nickname, position, business chip, description, contacts; admin badge + delete on hover in 3a, edit added in 3b).
- Status badges are **admin-only** in the mockup (both views) — keep that; public visitors see no status. Labels per the **Status Badge** term in CONTEXT.md: ACTIVE → ปกติ (success), EXPIRED/PENDING_RENEWAL → ยังไม่ได้ต่ออายุ (warning), RESIGNED → ลาออก (muted).
- Thai position labels: the mockup's `yecPositions` array (19 entries) matches `PositionSchema.options` order 1:1 — ship a client-side code→label map alongside the status map.
- Keyset pagination: "โหลดเพิ่มเติม" (cursor, shown while `has_more`) — no page numbers.
- CSV export: client-side; **selected rows, or all rows loaded so far when nothing is selected** (hence the toolbar button — a bulk-bar-only button can never fire the fallback). Headers ชื่อ-นามสกุล, ชื่อเล่น, ตำแหน่ง, กิจการ, เบอร์โทร, อีเมล, สถานะ; prepend `\uFEFF` BOM so Excel renders Thai; quote-wrap fields (escape embedded quotes); filename `yec_members_export.csv`.
- Delete dialog: ยืนยันการลบสมาชิก + "คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ {ชื่อ} ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้", ยกเลิก / ยืนยันลบ.
- Add/Edit wizard dialog (max-w-4xl), footer ย้อนกลับ / ถัดไป / บันทึกข้อมูล (**3b**):
  - **Tab 1 ข้อมูลการสมัคร** — applicant type radio (บุคคลธรรมดา/นิติบุคคล); uploads: `company_certificate` (หนังสือรับรองบริษัท/ทะเบียนพาณิชย์), `id_card_image` (สำเนาบัตรประชาชน).
  - **Tab 2 ข้อมูลส่วนตัว** — `profile_avatar` upload with preview; คำนำหน้า/ชื่อ/นามสกุล (TH) + Prefix/First/Last (EN) + ชื่อเล่น; เพศ; วันเดือนปีเกิด (native date input) with auto-computed readonly อายุ; สัญชาติ; เลขบัตรประชาชน 13 หลัก (digits-only mask) + วันหมดอายุบัตร; เป็นสมาชิกตั้งแต่ + auto-computed readonly ระยะเวลา; เบอร์โทร/อีเมล/Line ID; ไซส์เสื้อ (`ShirtSizeSchema.options`); ตำแหน่งใน YEC Lamphun (`PositionSchema.options`) — both enums from `src/app/api/v1/members/schema.ts`. No status field.
  - **Tab 3 ข้อมูลธุรกิจ** — ชื่อกิจการ, เลขทะเบียนนิติบุคคล, หมวดธุรกิจหลัก (from `GET /business/categories`), ที่อยู่, lat/lng, รายละเอียด, ผลิตภัณฑ์/บริการหลัก, Website; uploads `business_logo`, `business_product`.

## shadcn components to add

- **3a:** `bunx shadcn@latest add table checkbox avatar` (dialog/alert-dialog/skeleton already exist; **the mockup's avatar primitive does NOT exist yet** — add it).
- **3b:** `tabs radio-group switch` (+ `combobox` exists for the category select if wanted).

## Task breakdown

### 1. Structure & layout (3a)

- Toolbar → bulk bar → view toggle content → load-more. Table on desktop, card grid collapses gracefully at 375px.

### 2. API/data integration (3a)

- `useMembers({ search })` — debounced search resets the list; `useInfiniteQuery` keyed on the debounced term, `getNextPageParam` from `has_more`/`next_cursor`, `limit=20`.
- Delete: `useMutation` → `DELETE /api/v1/members/[id]`; on success toast + invalidate the list query (row disappears); on failure toast the `error_message`.

### 3. States (3a)

- Loading: table/grid skeletons. Empty search: ไม่พบข้อมูลสมาชิก. Error: alert + retry.
- Delete: confirm dialog; submitting disables the footer buttons.

### 4. Responsive (3a)

- 375px: card view default (via `useIsMobile()`); table horizontally scrollable if manually selected; 768px+: table default.

### 5. Validation & tests (3a)

- CSV builder tests (headers + BOM, quoting/escaping, selected-vs-all-loaded rows).
- Table component test with mocked fetch (renders rows incl. Thai position label + contacts, empty state, admin column/badges only in admin mode, status badge mapping).

### 6. Wizard (3b — separate session)

- Prereq: `id_card_no` null-sticky PATCH (README §8 item 9), then uploads-first flow mirroring `schema.ts` exactly; edit pre-fill from `GET [id]` (masked ID card → leave blank + "ปล่อยว่างเพื่อคงค่าเดิม" helper once null-sticky lands); restricted-position client warning per `src/modules/members/domain/position-conflict-policy.ts` (client needs its own code→cardinality map — the policy file exports only the pure predicate); server 409s surface as form errors.
- CSP heads-up: presigned private-file previews come from the R2 S3 endpoint host (`https://<account>.r2.cloudflarestorage.com`), NOT `R2_PUBLIC_BASE_URL` — add that origin to `img-src` in `next.config.ts` when the wizard's file previews land, or they will be `(blocked:csp)` the same way avatars were.

## Out of scope

- Bulk endpoint and any status-write UI (README §8 item 8); inline row editing; member detail page; status filter / sort controls (API supports them; no UI promised — add later only if asked); anything the list API doesn't return (ID-card numbers, `expires_at`).

## Acceptance criteria

### 3a (this PR)

- [ ] Search hits the server (debounced), resets paging; list/card toggle works.
- [ ] Cursor load-more works; no phantom page numbers.
- [ ] CSV exports selected rows (or all loaded when none selected) with the Thai headers + BOM.
- [ ] Delete confirm → soft delete; row disappears after invalidation.
- [ ] Admin-only UI (checkbox column, จัดการ, bulk bar, status badges) hidden when logged out.
- [ ] All four list states reachable; `bun run lint` + `bun run test` green.

### 3b (next PR)

- [ ] Wizard creates and edits a member end-to-end incl. file uploads; edit pre-fills from `GET [id]`.
- [ ] `id_card_no` null-sticky PATCH landed (schema, service, tests, OpenAPI + Apidog re-export).
- [ ] Restricted-position warning + server 409 surfaced on the form.
- [ ] เพิ่มสมาชิก button + edit action wired to the wizard.

## AI implementation prompt

```text
Implement UI-03a (Members list) in this repo. UI-03b (wizard) is a separate
later session — do NOT build the wizard, the เพิ่มสมาชิก button, or the edit
action.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Member File, Position, Status Badge).
2. The card: docs/ui-conversion/cards/03-members.md — esp. "Scope split".
3. Mockup: ui-mockup/YEC-Lamphun.html, MemberSystem component (~line 496) —
   structural reference only.
4. API: docs/openapi/api-yec-lamphun-backoffice-web.openapi.json, then
   src/app/api/v1/members/route.ts + list-schema.ts (query + response
   mapping).
5. ADR-0013 (soft delete). README §8 items 7–9.

Scope: /members page content only — shell/providers exist (card 00).
In scope: list/card views + server-side debounced search + cursor load-more,
CSV export (selected or all-loaded), delete confirm, admin gating, component
tests. Out of scope: wizard, add/edit buttons, bulk status (impossible — PATCH
has no status field), status filter/sort UI, bulk API, member detail page.

Constraints:
- TanStack Query (useInfiniteQuery) via fetchJson; errors are { error_message }.
- Semantic OKLCH tokens; cn(); data-slot; tabs indentation; src/ imports.
- Thai copy + status/position label mappings per the card (CONTEXT.md Status
  Badge term; badges admin-only).

Definition of done: the card's 3a acceptance criteria, plus `bun run lint` and
`bun run test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1).
- Mockup: `MemberSystem` — `ui-mockup/YEC-Lamphun.html` ~lines 496–912.
- `src/app/api/v1/members/**`; `src/modules/members/**`; ADRs 0007/0008/0012/0013.
- README §8 items 8–9 (status-write drop, id_card_no edit gap).
