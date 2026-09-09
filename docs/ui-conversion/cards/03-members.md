[UI-03] Members — รายชื่อสมาชิก

## Goal

The member directory at `/members`: searchable list/card views with server-side cursor paging, admin delete confirmation, selection-based CSV export (3a — shipped), and a 4-step add/edit wizard sheet (3b — create shipped, edit remaining).

## Scope split (executed, then re-split for 3b)

The largest card, split across PRs (see README §2):

- **3a — list view** — **SHIPPED**: PR #42 (`83b05fa`), then relocated into the module by the ADR-0022 folder refactor PR #43 (`4de4502`). Toolbar (search + view toggle), table + card grid, cursor load-more, admin selection + bulk bar with Export CSV, delete confirmation, all four list states, responsive, component tests. The admin จัดการ column renders **delete only**; the edit action arrives with 3b-edit.
- **3b — add/edit wizard, re-split into two PRs** after the mockup v2 resync:
	- **3b-create** (branch `feature/ui-03b-create-member`) — **SHIPPED**: PR #45 (`389b41e`). The admin-only เพิ่มสมาชิก button + the full v2 wizard shell + the create flow end-to-end incl. file uploads. Follow-ups folded into the same PR during review: the 500ms submit-arming window (footer ถัดไป→ยืนยัน same-coordinate swap guard), client VARCHAR guards (`DB_MAX_LENGTHS`), live-contact uniqueness (partial unique indexes + `FindLiveContactConflicts` 409 pre-checks in create AND update, self-excluding), id-card + phone input masks, searchable Comboboxes on all six dropdowns, backward-only step rail in create mode, and document-upload image previews (local FileReader `data:` URLs).
	- **3b-edit** (branch `feature/ui-03b-edit-member` off main after 3b-create merges; **PR closes #41**): the จัดการ edit action, pre-fill from `GET [id]`, presigned previews + the CSP origin addition, and the `id_card_no` null-sticky PATCH prerequisite (README §8 item 9) — an **edit-side gap only**: `GET [id]` returns the Masked ID Card, so without null-stickiness every edit would force re-typing the full ID number. Creation is unaffected, which is why 3b-create ships first without it.

**Dropped from the card** (README §8 item 8): the mockup's bulk status buttons (ปรับเป็นยังไม่ได้ต่ออายุ / ปรับเป็นปกติ) — still drawn in mockup v2, still dropped. The v1 wizard's Tab-2 status toggle is **gone in v2**: add mode renders disabled "ระบบจะระบุอัตโนมัติ/คำนวณอัตโนมัติ" fields, edit mode a read-only display with the lock note "ข้อมูลการต่ออายุและสถานะจัดการผ่านหน้า 'ต่ออายุสมาชิก' เท่านั้น" — v2 now agrees with the API (`PATCH` has no `status` field and never will; Member Status is owned by the renewal flow, card 04). The bulk bar therefore carries only the selection count and Export CSV.

## Route & files

- `src/app/(public)/members/page.tsx`.
- `src/modules/members/components/` — `members-view.tsx` (toolbar + views), `members-table.tsx`, `members-card-grid.tsx`, `member-wizard-dialog.tsx` (+ its four step forms, **3b-create**), `delete-member-dialog.tsx`, `bulk-actions-bar.tsx`; data hook `src/modules/members/hooks/use-members.ts`. (Moved out of `src/shared/components/members/` per ADR-0022.)
- Client-side valibot schemas mirroring the server contract — `src/modules/members/schemas/` (per ADR-0022; promote to domain only if they become shared domain logic).

## API contract

> **Full API documentation:** `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` — Apidog export (OpenAPI 3.1) with request/response schemas for every endpoint below. Where this card and the code disagree, the code + this spec win.

- `GET /api/v1/members` — public. Query: `search` (prefix ILIKE on `first_name_th` OR `phone_no` OR `position_code` — the position match is on the stored English code), `status` (CSV of `ACTIVE|EXPIRED|PENDING_RENEWAL|RESIGNED`), `sort_by` (`created_at|first_name_th|expires_at`), `sort_order`, `limit` (1..50, default 10; UI uses 20), `cursor`. Response rows are snake_case (`profile_avatar`, `title_name_th`, `first_name_th`, `last_name_th`, `nickname`, `phone_no`, `email`, `line_id`, `position` = raw position **code**, `status`, `business: { name, description }`); envelope `{ data, has_more, next_cursor }`. No default status filter — `RESIGNED` members are returned. Source: `src/app/api/v1/members/route.ts` (response mapping) + `list-schema.ts`.
- `GET /api/v1/members/[id]` — **admin** (withAuth). Detail incl. Masked ID Card + resolved file URLs (private files as 1-hour presigned URLs, public files as concatenated URLs), `business.category_id`, `member_since`, `status`. Used to populate the edit wizard (**3b-edit**). Note the read shapes: `id_card_no` is masked or null; `business.location` is `[longitude, latitude]` in storage order while the write contract takes `[lat, long]`.
- `POST /api/v1/members` — admin. Create (**3b-create**); source: `schema.ts` (the exact payload incl. how uploaded file paths attach).
- `PATCH /api/v1/members/[id]` — admin. Hybrid null-sticky update (ADR-0012) — **has no `status` field and never will** (README §8 item 8); **3b-edit prerequisite:** extend null-sticky to `id_card_no` (README §8 item 9). Edit-side only — `POST` already takes the full 13-digit number.
- `DELETE /api/v1/members/[id]` — admin. Cascade soft-delete, idempotent 204 (ADR-0013).
- `POST /api/v1/members/file/upload` — public multipart. Field names (exactly six; the wizard uses five — `payment_slip` belongs to the renewal flow): `id_card_image`, `company_certificate`, `profile_avatar`, `business_logo`, `business_product`, `payment_slip` — `src/modules/members/member-file.constants.ts` (7MB max, `.jpg/.jpeg/.png/.webp`) (**3b-create**).
- `GET /api/v1/members/file/presign` — **admin**. Re-mints a temporary (1-hour) view URL for a private file path when a URL resolved by `GET [id]` has expired (**3b-edit**). Documented in the spec but **no route exists yet** — 3b-edit implements it against the documented contract.
- `GET /api/v1/business/categories` — public, returns `{ id, name }[]`. Feeds the category select (**3b-create**; edit pre-selects by `category_id` from `GET [id]` in 3b-edit). The mockup's 14 numbered label strings are vocabulary only — the select is fed live by this endpoint (README §8 item 10).

## UI structure (from mockup v2)

Mockup: `MemberSystem` component, `ui-mockup/YEC-Lamphun.html` ~lines 496–1238. **Mockup v2 changed nothing in the list view** — toolbar, bulk bar, columns, badges, card grid, delete dialog are byte-identical to v1 — so the shipped 3a list stands as-is with its documented deliberate deviations. Everything below under "Wizard" is new in v2.

- Toolbar: heading รายชื่อสมาชิก; search input (placeholder "ค้นหาชื่อจริง, เบอร์โทร หรือรหัสตำแหน่ง..." + title tooltip explaining prefix matching — deliberate deviation from the mockup's "ค้นหาชื่อ, ตำแหน่ง...", which over-promised: the API prefix-matches `first_name_th`/`phone_no`/`position_code` only, so no last name and no Thai position label; server-side, debounced ~300ms); list/card view toggle; admin-only **Export CSV** button (lives in the toolbar, not the bulk bar, so it stays reachable with nothing selected); admin-only เพิ่มสมาชิก button (**3b-create** — opens the wizard).
- Bulk bar (admin, when rows selected): "เลือกแล้ว N รายการ". (Export moved to the toolbar; status buttons dropped — see Scope split.)
- Table columns: [admin checkbox] · ชื่อ-สกุล/ตำแหน่ง (avatar + admin-only status badge + `${title_name_th}${first_name_th} ${last_name_th}` + (nickname) + Thai position label) · ธุรกิจ/กิจการ (`business.name`) · รายละเอียดธุรกิจ (`business.description`) · ติดต่อ (phone/email/LINE ID) · [admin] จัดการ (delete shipped; the edit icon แก้ไขข้อมูล joins it stacked in **3b-edit**).
- Card view: responsive grid (1/2/3/4 cols) of member cards (avatar, name+nickname, position, business chip, description, contacts; admin badge + delete on hover; edit joins in **3b-edit**). Selection is intentionally table-only (the mockup has no card checkboxes) — a table-made selection persists across the view toggle and still drives Export CSV.
- Status badges are **admin-only** in the mockup (both views) — keep that; public visitors see no status. Labels per the **Status Badge** term in CONTEXT.md: ACTIVE → ปกติ (success), EXPIRED/PENDING_RENEWAL → ยังไม่ได้ต่ออายุ (warning), RESIGNED → ลาออก (muted).
- Thai position labels: the mockup's `yecPositions` array (19 entries) matches `PositionSchema.options` order 1:1 — the client code→label map already shipped in `member-labels.ts`.
- Keyset pagination: "โหลดเพิ่มเติม" (cursor, shown while `has_more`) — no page numbers.
- CSV export: client-side; **selected rows, or all rows loaded so far when nothing is selected** (hence the toolbar button — a bulk-bar-only button can never fire the fallback). Headers ชื่อ-นามสกุล, ชื่อเล่น, ตำแหน่ง, กิจการ, เบอร์โทร, อีเมล, สถานะ; prepend `\uFEFF` BOM so Excel renders Thai; quote-wrap fields (escape embedded quotes); filename `yec_members_export.csv`.
- Delete dialog: ยืนยันการลบสมาชิก + "คุณแน่นใจหรือไม่ว่าต้องการลบข้อมูลของ {ชื่อ} ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้", ยกเลิก / ยืนยันลบ.

### Wizard (v2 — 3b-create builds it; 3b-edit inherits the shell)

- **Container**: near-fullscreen sheet-style Dialog — full-screen on mobile, `sm:max-w-6xl` at ~92vh with rounded corners from `sm:` up. Header: icon + title **ลงทะเบียนสมาชิกใหม่** (create) / **แก้ไขข้อมูลสมาชิก** (edit), the "บันทึกฉบับร่างอัตโนมัติ" hint (create mode), and a guarded close button.
- **Step rail (desktop, left)**: four steps — 1 ข้อมูลการสมัคร · 2 ข้อมูลส่วนตัว · 3 ข้อมูลธุรกิจ · 4 ตรวจสอบข้อมูล. Create mode **locks forward jumps** until the preceding steps validate (a rail click re-validates steps 1…target−1 and drops the user on the first failing one); completed steps show ✓ and stay revisitable. Edit mode unlocks all steps. Mobile replaces the rail with a "ขั้นตอน X/4" label + progress bar.
- **Validation**: per-field on blur + on next; top-of-form error summary alert "พบข้อผิดพลาด N รายการ กรุณาตรวจสอบข้อมูล"; inline field errors with `role="alert"` + `aria-invalid`, red input styling.
- **Step 1 ข้อมูลการสมัคร** — applicant type radio cards บุคคลธรรมดา/นิติบุคคล; เอกสารแนบ uploads: หนังสือรับรองบริษัท/ทะเบียนพาณิชย์ (`company_certificate`, required for นิติบุคคล + helper "นิติบุคคลต้องแนบหนังสือรับรองบริษัท") and สำเนาบัตรประชาชน (`id_card_image`, optional — the API field is nullable).
- **Step 2 ข้อมูลส่วนตัว** — `profile_avatar` upload with camera-overlay preview (แนะนำขนาด 1:1); คำนำหน้า (TH: นาย/นาง/นางสาว/อื่นๆ — exactly `TitleNameThSchema`) · ชื่อ (TH)\* · นามสกุล (TH)\* · ชื่อเล่น\*; Prefix/First/Last (EN — `TitleNameEnSchema` Mr./Mrs./Ms./Miss, names optional); เพศ (MALE/FEMALE/OTHER); วันเดือนปีเกิด\* + auto-computed readonly อายุ; สัญชาติ\* (default ไทย); เลขบัตรประชาชน 13 หลัก (digits-only mask, 13-digit check) + วันหมดอายุบัตร\* (domain rule: ≥ today); **การต่ออายุสมาชิก block** — create mode: disabled inputs "ระบบจะระบุอัตโนมัติ/คำนวณอัตโนมัติ"; edit mode: read-only เป็นสมาชิกตั้งแต่ + ระยะเวลา + status pill with the lock note (renewal-owned, see Scope split); เบอร์โทรศัพท์\* (format check) · อีเมล (format check) · Line ID; ไซส์เสื้อ (`ShirtSizeSchema` codes ↔ "M (อก 40)"-style labels); ตำแหน่งใน YEC Lamphun (`PositionSchema` codes ↔ Thai labels; restricted positions client-checked, error names the current holder).
- **Step 3 ข้อมูลธุรกิจ** — ชื่อกิจการ/ร้านค้า\*; เลขทะเบียนนิติบุคคล\* (**unconditionally required by the API** — mockup v2 still marks it juristic-only; README §8 item 10); หมวดธุรกิจหลัก\* (select fed by `GET /business/categories` — id values, Thai name labels); ที่อยู่กิจการ (textarea); Latitude/Longitude inputs (parsed to the write-side `[lat, long]` pair); รายละเอียดกิจการสั้นๆ\* (API-required — v2 missed the marker); ผลิตภัณฑ์หรือบริการหลัก (`core_business`); Website; uploads `business_logo` + `business_product`.
- **Step 4 ตรวจสอบข้อมูล (review)** — green info banner; three `dl` sections mirroring steps 1–3 with per-section **แก้ไข** jump-back buttons; เป็นสมาชิกตั้งแต่ shows "ระบบจะคำนวณอัตโนมัติ" (create) / the stored date (edit), สถานะสมาชิก shows "ระบบจะระบุอัตโนมัติ" (create) / the current badge (edit).
- **Footer**: ย้อนกลับ (disabled on step 1) · ถัดไป · on step 4 the green **ยืนยันบันทึกข้อมูล** with กำลังบันทึก... spinner while submitting.
- **Close guard**: X button and Escape are intercepted — if dirty, an alertdialog "มีข้อมูลที่ยังไม่ได้บันทึก / ต้องการบันทึกฉบับร่างไว้ก่อนออกจากหน้านี้หรือไม่?" offers บันทึกฉบับร่าง (create mode saves the draft; edit mode just closes) / ออกโดยไม่บันทึก (clears the create draft) / แก้ไขต่อ. Focus is trapped inside the sheet.
- **Draft autosave** (create mode only — the **Member Form Draft** term in CONTEXT.md): every change saves a localStorage draft (File objects excluded, single key `yec-member-form-draft`); reopening the wizard restores it with the banner กู้คืนฉบับร่างที่บันทึกไว้ล่าสุดแล้ว + เริ่มกรอกใหม่; cleared on successful submit or discard. Edit mode never reads or writes the draft.
- **Success dialog**: ลงทะเบียนสมาชิกเรียบร้อย (create) / บันทึกการแก้ไขเรียบร้อย (edit), "ข้อมูลของ {ชื่อ} ถูกบันทึกลงระบบแล้ว" → ดูรายชื่อสมาชิก (close) and, create-only, เพิ่มสมาชิกอีกคน (fresh form, no draft).
- **Pre-fill-friendly state shape**: keep the wizard's form state a mirror of the wire contract (GET `[id]` detail fields, or one explicit form↔wire mapping layer — never ad-hoc string parsing like the mockup's name-splitting). File fields hold `{ file?, existingUrl? }` pairs so edit pre-fill slots URLs in and create starts empty. Required-ness follows `CreateMemberSchema`/`PatchMemberSchema`, not the mockup's markers: nickname, date_of_birth, nationality, id_card_expiry_date, `business.juristic_registration_no`, and `business.description` are all required (README §8 item 10).

## shadcn components to add

- **3a:** `table checkbox avatar` — shipped (dialog/alert-dialog/skeleton already existed).
- **3b:** `radio-group progress` (applicant-type radios; the mobile step-progress bar). Dialog + alert-dialog cover the sheet, close-guard, and success dialogs — v2 has no tabs and no switch anymore (the step rail replaces tabs; the status toggle is retired).

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

### 6. Wizard shell + create flow (3b-create — separate session)

- Admin-only เพิ่มสมาชิก button in the toolbar opens the wizard in create mode; build the full v2 shell per "UI structure" (sheet container, step rail + mobile progress, four steps incl. review, blur/next validation + error summary, dirty-guard close confirm + Escape + focus trap, draft autosave/restore, submitting + success dialog with เพิ่มสมาชิกอีกคน).
- Uploads-first flow mirroring `schema.ts` exactly: each of the five wizard file fields uploads via `POST /api/v1/members/file/upload` (client checks 7MB + image extensions per `member-file.constants.ts`) and the returned paths attach to the `POST /api/v1/members` payload.
- Client-side valibot schemas in `src/modules/members/schemas/` mirroring `CreateMemberSchema` — including the six API-required fields the mockup marks optional.
- Restricted-position client warning per `src/modules/members/domain/position-conflict-policy.ts` (client ships its own code→cardinality map — the policy file exports only the pure predicate); server 409s surface as form errors.
- Optional structure tidy-up while the wizard files land: revisit the homes of the non-component helpers that moved with the refactor into `src/modules/members/components/` (`members-types.ts`, `member-labels.ts`, `export-members-csv.ts`, `make-member.fixture.ts`) — candidates: view-model types next to the new `schemas/`, fixtures under `__fixtures__/` if tests multiply. Deliberately deferred from the moves-only refactor (PR #43); re-classify only if the bigger folder actually needs it.

### 7. Edit flow (3b-edit — separate session, closes #41)

- Prereq: `id_card_no` null-sticky PATCH (README §8 item 9) — schema, service, tests, OpenAPI + Apidog re-export. Edit-side only; 3b-create already shipped without it because `POST` takes the full 13-digit number.
- จัดการ edit action (table + card hover) opens the wizard pre-filled from `GET [id]`: Masked ID Card → leave blank + "ปล่อยว่างเพื่อคงค่าเดิม" helper once null-sticky lands; `business.location` arrives `[long, lat]` — swap for the two inputs, write back `[lat, long]`; renewal block read-only per v2.
- Existing-file previews: private files (`company_certificate`, `id_card_image`) arrive as 1-hour presigned URLs; re-mint via `GET /api/v1/members/file/presign` when expired. CSP: presigned previews come from the R2 S3 endpoint host (`https://<account>.r2.cloudflarestorage.com`), NOT `R2_PUBLIC_BASE_URL` — add that origin to `img-src` in `next.config.ts` in this PR, or previews will be `(blocked:csp)` the same way avatars were.
- Unchanged files ride the PATCH as JSON null (ADR-0012 five file-path fields); edit mode keeps free step navigation, no draft, dirty-guard still applies.

## Out of scope

- Bulk endpoint and any status-write UI (README §8 item 8); inline row editing; member detail page; status filter / sort controls (API supports them; no UI promised — add later only if asked); anything the list API doesn't return (ID-card numbers, `expires_at`).

## Acceptance criteria

### 3a (SHIPPED — PR #42, `83b05fa`; relocated by PR #43, `4de4502`)

- [x] Search hits the server (debounced), resets paging; list/card toggle works.
- [x] Cursor load-more works; no phantom page numbers.
- [x] CSV exports selected rows (or all loaded when none selected) with the Thai headers + BOM.
- [x] Delete confirm → soft delete; row disappears after invalidation.
- [x] Admin-only UI (checkbox column, จัดการ, bulk bar, status badges) hidden when logged out.
- [x] All four list states reachable; `bun run lint` + `bun run test` green.

### 3b-create (SHIPPED — PR #45, `389b41e`)

- [x] Admin-only เพิ่มสมาชิก opens the v2 wizard: sheet, step rail with locked-forward create navigation, mobile ขั้นตอน X/4 progress, review step with แก้ไข jump-backs.
- [x] Per-field blur + step validation with Thai messages; the six API-required fields enforced; error summary + `aria-invalid`/`role="alert"` wiring.
- [x] Uploads-first: five file fields upload then attach paths; client size/extension checks mirror `member-file.constants.ts`.
- [x] Draft lifecycle per the Member Form Draft term (autosave, restore banner + เริ่มกรอกใหม่, clear on submit/discard; create mode only); dirty-guard close confirm + Escape + focus trap.
- [x] Submit → `POST /api/v1/members`; success dialog (ลงทะเบียนสมาชิกเรียบร้อย + เพิ่มสมาชิกอีกคน); list refreshes; server 400/409 surface as form errors.
- [x] Restricted-position client warning (code→cardinality map) + server 409 as a form error.
- [x] Category select live from `GET /business/categories`.
- [x] `bun run lint` + `bun run test` green; wizard component tests (validation gating, draft lifecycle, dirty guard).

### 3b-edit (final PR — `feature/ui-03b-edit-member`; **closes #41**)

- [ ] `id_card_no` null-sticky PATCH landed (schema, service, tests, OpenAPI + Apidog re-export).
- [ ] จัดการ edit action (table + card) opens the wizard pre-filled from `GET [id]`; masked ID → blank + "ปล่อยว่างเพื่อคงค่าเดิม".
- [ ] Presigned previews for private files + re-mint on expiry via `GET /file/presign`; CSP `img-src` += `https://<account>.r2.cloudflarestorage.com`.
- [ ] Edit mode: free step navigation, no draft, dirty-guard applies, renewal block read-only with the lock note.
- [ ] PATCH round-trip: unchanged files sent as JSON null (ADR-0012); success dialog บันทึกการแก้ไขเรียบร้อย; list refreshes.

## AI implementation prompt

The 3a and 3b-create prompts have served their purpose (shipped). The card now carries the prompt for the final unit — 3b-edit.

```text
Implement UI-03b-edit (member edit flow) in this repo — the final UI-03
unit; this is the PR that closes #41. The create wizard already shipped
(PR #45): you are EXTENDING it with an edit mode, not rebuilding it.
Unit 1 is backend, everything after is the edit UI on top.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Member File, Member File Field,
   Masked ID Card, Position, Status Badge, Member Form Draft, Step Rail).
2. The card: docs/ui-conversion/cards/03-members.md — esp. "Scope split",
   "Wizard" under "UI structure" (edit-mode rows), and §7 "Edit flow".
3. Mockup v2: ui-mockup/YEC-Lamphun.html, MemberSystem wizard
   (~lines 982–1235) — edit-mode presentation only (read-only renewal
   block, free rail); never pixel-perfect. Where mockup and API disagree,
   the API wins.
4. ADRs: 0022 (modules own their frontend), 0021 (RHF + valibot — the
   pattern the wizard already uses), 0012 (null-sticky PATCH — unit 1
   extends it to id_card_no), 0002 (two buckets). README §8 items 8–10.
5. API: docs/openapi/api-yec-lamphun-backoffice-web.openapi.json — note
   GET /api/v1/members/file/presign is DOCUMENTED BUT NOT IMPLEMENTED
   (no route exists yet; build it in unit 1 to match the documented
   contract). Then src/app/api/v1/members/schema.ts (PatchMemberSchema),
   the GET [id] route + its response mapping (masked id_card_no, resolved
   file URLs, business.location stored [long, lat] while the write
   contract takes [lat, long]), and
   src/modules/members/member-file-url.service.ts (the existing presign
   machinery to reuse for the new route).
6. The shipped create wizard you are extending: src/modules/members/
   components/member-wizard-dialog.tsx (+ its four step forms and
   member-wizard-file-field.tsx), src/modules/members/schemas/
   member-wizard-schema.ts + member-wizard-mapping.ts (the pre-fill seam:
   MemberWizardFormValues mirrors the wire contract with { file,
   existingUrl } file pairs; buildCreatePayload; formatIdCardNo;
   formatPhoneNumber; DB_MAX_LENGTHS), hooks/use-create-member.ts
   (uploads-first pattern) + hooks/use-members.ts, member-combobox-
   select.tsx, member-labels.ts, and members-view/-table/-card-grid
   (the จัดการ column the edit action joins).
7. member-wizard-dialog.test.tsx — the jsdom recipes (combobox, radio,
   pointer stubs, armAndSubmit) the edit-mode tests must extend.
8. next.config.ts — CSP img-src derives from R2_PUBLIC_BASE_URL;
   presigned previews come from the R2 S3 endpoint host
   (https://<account>.r2.cloudflarestorage.com) and need that origin
   added; verify with `curl -I` on the served header, never guess.

Scope — unit 1 (backend, land first):
- id_card_no null-sticky: PatchMemberSchema takes nullable id_card_no,
  null (or absent) = keep the stored value; update-member service +
  tests; OpenAPI re-export + the Apidog sync deliverable per repo
  convention.
- GET /api/v1/members/file/presign: admin, re-mints a 1-hour view URL
  for a private file path — implement the route to match the documented
  spec, reusing member-file-url machinery, with tests.

Scope — the edit UI:
- จัดการ edit action (table row + card hover) opens the wizard in edit
  mode, pre-filled from GET [id] through the mapping seam.
- Masked ID Card: NEVER write the masked value into form state — leave
  the field blank with the helper "ปล่อยว่างเพื่อคงค่าเดิม"; blank
  submits null → null-sticky keeps the stored number.
- Files: existing files render as presigned previews (re-mint on expiry
  via the presign route); a changed file uploads first then attaches;
  an UNCHANGED file rides the PATCH as JSON null (ADR-0012); a removal
  follows the existing delete-path semantics.
- Edit-mode shell per the card: free step navigation (rail unlocked),
  no draft (never read/write localStorage), dirty-guard still applies,
  renewal block read-only with the lock note, review step shows stored
  values, success dialog บันทึกการแก้ไขเรียบร้อย, list refreshes.
- Server 400/409 surface as form errors — the contact 409s (phone/
  email/Line ID) already self-exclude the edited member server-side;
  map them to the same Thai field errors create mode uses.

Preserve — invariants from the 3b-create review (do not regress):
- The 500ms submit-arming window on entering step 4 (footer ถัดไป→ยืนยัน
  same-coordinate swap guard) — applies in edit mode too.
- Create mode's rail stays backward-only (ถัดไป the only forward
  navigation); only edit mode unlocks it.
- Phone: the DASHED string (xxx-xxx-xxxx) is the stored value; legacy
  DB rows are mixed digits/dashes, so pre-fill must tolerate both
  (formatPhoneNumber is idempotent) and submit keeps dashes.
- id_card_no stays digits-only in form state with the display mask.
- DB_MAX_LENGTHS maxLength attrs stay on every input.

Out of scope: create-flow redesign (share the shell, don't restyle it),
list-view changes, bulk status (impossible — PATCH has no status field),
a member detail page, the renewal flow (card 04), any new backend write
endpoint beyond the two unit-1 items.

Constraints:
- TanStack Query mutations via fetchJson; errors are { error_message }.
- Semantic OKLCH tokens; cn(); data-slot; tabs indentation; src/ imports.
- Thai copy per the card; label maps from member-labels.ts; no status
  writes anywhere in the wizard.

Workflow: branch feature/ui-03b-edit-member off main; commit per unit;
run /scrutinize before the PR; push and open the PR — its description
closes #41 (the only PR allowed to carry a closing keyword); never
merge. Surface every question or suggestion to the user as a decision
(options + recommendation) — never decide for them.

Definition of done: the card's 3b-edit acceptance criteria walked one by
one, plus `bun run lint` and `bun run test` passing. Verify the CSP
change against the actually served header (curl -I) before claiming the
preview criterion.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1).
- Mockup v2: `MemberSystem` — `ui-mockup/YEC-Lamphun.html` ~lines 496–1238 (wizard is lines ~982–1235).
- `src/app/api/v1/members/**`; `src/modules/members/**`; ADRs 0002/0007/0008/0012/0013/0022.
- README §8 items 8–10 (status-write drop + v2 alignment, id_card_no edit gap, v2 wizard dispositions).
