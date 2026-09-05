[UI-04] Membership renewal — ระบบต่ออายุสมาชิก

## Goal

The renewal workflow at `/renewal`: an open/closed system gate, filter stat cards, a status-tabbed member table with server-side search, the member renewal form (slip upload + PDPA consent), and the admin review/manual-renewal actions.

Do this after card 03 — it reuses the member-autocomplete and file-upload patterns established there.

## Route & files

- `src/app/renewal/page.tsx`.
- `src/shared/components/renewal/` — `renewal-gate.tsx` (closed state / admin toggle), `renewal-stats.tsx`, `renewal-table.tsx`, `renewal-form-dialog.tsx`, `review-dialog.tsx`, `slip-viewer.tsx`.

## API contract

- `GET /api/v1/system-settings` — public. Returns `{ open_membership_renewal: boolean }` (feature-key map; see `src/modules/system-settings/validators.ts`).
- `PATCH /api/v1/system-settings` — admin. Body `{ open_membership_renewal: boolean }` — the admin on/off toggle.
- `GET /api/v1/membership/renewals/stat` — public. Three badge counts (expired / pending / approved).
- `GET /api/v1/membership/renewals` — public. Query: `status`, `search`, `limit`, `cursor` (server-side search — see `route.ts` + `list-schema.ts`).
- `GET /api/v1/membership/renewals/expired` — public. Expired list, rejected-first ordering, keyset.
- `POST /api/v1/membership/renewals` — public with cookie fork: staff cookie ⇒ instant APPROVED; member ⇒ PENDING_REVIEW (ADR-0015). Success 201 `{ id }`; 400/404/403/409 errors.
- `POST /api/v1/membership/renewals/manual` — admin (ADR-0016). Manual renewal + advances the membership clock.
- `PATCH /api/v1/membership/renewals/review/[renewal_id]` — admin. Approve / reject-with-reason (guarded transition, ADR-0018).
- `GET /api/v1/membership/renewals/[member_id]` — admin. Latest renewal incl. presigned slip URL + avatar.
- `GET /api/v1/members?search=` — public. Feeds the name autocomplete.
- `POST /api/v1/members/file/upload` — field name `payment_slip`.

## UI structure (from mockup)

Mockup: `MembershipRenewal` component, `ui-mockup/YEC-Lamphun.html` ~line 913.

- **Gate**: system closed + not admin → full-page state ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ + contact card (phone 053-511-168 per mockup — see README §8 item 4).
- **Admin toggle**: เปิด/ปิด switch pill wired to `PATCH /system-settings`; red warning banner when closed.
- **Fee banner**: blue gradient card — ค่าธรรมเนียม 5,000 บาท/กิจการ; ส่วนลด: กิจการเดียวกันท่านที่ 2 → 4,000 บาท, คณะทำงาน YEC Lamphun → ลด 500/คน. Static copy.
- **3 clickable stat cards** (from `/stat`): ยังไม่ได้ต่ออายุ / รอตรวจสอบการโอน / ปกติ (ต่ออายุแล้ว) — clicking filters the table (maps to `expired` / `PENDING_REVIEW` / `APPROVED` lists; verify the exact mapping against the routes).
- **Search bar** — server-side, debounced.
- **Table**: สมาชิก (avatar, name+nickname, phone) · ประเภท (คณะกรรมการ/สมาชิกทั่วไป) · วันที่เป็นสมาชิก · [admin] วันที่ทำรายการ · สถานะ badge · [admin] ดำเนินการ. Badge wording per mockup: ปกติ / รอตรวจสอบ / กรุณาติดต่อฝ่ายข้อมูลและทะเบียนสมาชิก / รอต่ออายุ — align each to the API's actual status enums (CONTEXT.md state machine).
- **Row actions (admin)**: รอตรวจสอบ → ตรวจสอบ/อนุมัติ (review dialog); rejected/needs-contact → ต่ออายุ (Manual); pending → ต่ออายุ (Manual); approved → เรียบร้อย + eye icon (slip viewer).
- **Primary button** แจ้งชำระเงิน / ต่ออายุ — opens the renewal form.
- **Renewal form dialog** (member mode "แจ้งต่ออายุสมาชิก" / admin manual mode "ต่ออายุสมาชิก (ผู้ดูแลระบบ)"): name-or-business autocomplete from `/members?search=` (readonly in manual mode); checkbox กรณีที่กิจการเดียวกันแต่มีอีกคน หรืออีก 2 คน (ได้รับส่วนลดพิเศษ) revealing a 1–5 count select + per-member autocomplete rows; static bank info card (ธนาคารกสิกรไทย, YEC LAMPHUN, 207-8-13870-2); slip upload (dropzone + preview, required, `payment_slip`); scrollable PDPA consent box + required checkbox gating submit; note อัปเดต 1–2 วันทำการ; buttons ยกเลิก / ส่งข้อมูล (member) or อนุมัติ (admin manual).
- **Review dialog** ตรวจสอบการชำระเงิน: member info grid (name, nickname, business, phone, type) + slip image (presigned URL from `GET [member_id]`) + อนุมัติ / ไม่อนุมัติ → reason textarea (e.g. สลิปไม่ชัดเจน, ยอดเงินไม่ถูกต้อง) → confirm. Approved members see ปิดหน้าต่าง only.

## shadcn components to add

None expected beyond card 03's set (table, tabs/checkbox, dialog, switch, alert, skeleton all exist by now).

## Task breakdown

### 1. Structure & layout

- Closed-gate branch renders instead of the page content. Open: fee banner → stat cards → search → table. Dialogs layered on top.

### 2. API/data integration

- `useSystemSettings()` (public read) + admin toggle mutation with optimistic update.
- Stat query; list queries keyed by active filter (regular list for PENDING_REVIEW/APPROVED, `expired` endpoint for the expired filter) with `search` + cursor.
- Renewal submit: upload slip → `POST /renewals` (or `/manual`); invalidate stat + list queries.
- Review: `PATCH /renewals/review/[renewal_id]`; slip viewer: `GET /renewals/[member_id]`.

### 3. States

- Gate closed (member vs admin variants). Loading skeletons for stats + table. Empty: ไม่พบข้อมูล. Error: alert + retry.
- Form: consent gates submit; upload progress/preview; 409/404 errors surfaced inline from `{ error_message }`.
- Success: toast + dialog close + lists refresh.

### 4. Responsive

- 375px: stat cards stack, table scrolls horizontally, dialogs near-fullscreen. 768px+: normal grid.

### 5. Validation & tests

- Form tests: consent required, additional-members block only visible when checkbox set, autocomplete selection required.
- Table test with mocked queries: admin action column per status, badge rendering.

## Out of scope

- Editing fee amounts/discount rules (static copy — README §8 item 5); email/notifications; bulk renewal; PDPA text legal review.

## Acceptance criteria

- [ ] Closed system shows the member gate; admin sees the toggle + can flip it (persists via PATCH).
- [ ] Stat cards render counts from `/stat` and filter the table on click.
- [ ] Server-side search works per active filter; cursor load-more works.
- [ ] Member renewal form submits end-to-end: autocomplete → slip upload → consent → 201; status becomes รอตรวจสอบ.
- [ ] Admin review dialog approves and rejects-with-reason; slip viewer shows the presigned image.
- [ ] Admin manual renewal works for pending/contact rows.
- [ ] All four states reachable; admin-only elements hidden when logged out; `bun run lint` + `bun test` green.

## AI implementation prompt

```text
Implement Trello card [UI-04] Membership renewal in this repo.

Read first, in order:
1. AGENTS.md, then CONTEXT.md (terms: Renewal Status, Member Status, state
   machines, Membership Renewal List, Renewal Stat).
2. The card: docs/ui-conversion/cards/04-membership-renewal.md.
3. Mockup: ui-mockup/YEC-Lamphun.html, MembershipRenewal component
   (~line 913) — structural reference only.
4. API: src/app/api/v1/membership/renewals/** (route.ts + list-schema.ts,
   manual/, review/, [member_id]/, expired/, stat/) and
   src/app/api/v1/system-settings/route.ts (open_membership_renewal).
5. ADRs 0015, 0016, 0017, 0018 (cookie fork, manual, stat, guarded review).

Scope: /renewal page content only — shell/providers exist (card 00), and the
member autocomplete + upload patterns from card 03 can be reused.
In scope: system gate + admin toggle, fee banner (static), stat filter cards,
status-tabbed table with server-side search + cursor, renewal form dialog
(autocomplete, additional-members block, slip upload, PDPA consent), review
dialog (approve/reject with reason), slip viewer, manual renewal, tests.
Out of scope: fee editing, notifications, PDPA legal review.

Constraints:
- TanStack Query; errors are { error_message }; status badges must map to the
  API's actual enums (verify in the route/CONTEXT.md, not the mockup's names).
- Slip upload uses the payment_slip multipart field
  (src/modules/members/member-file.constants.ts).
- Semantic OKLCH tokens; cn(); data-slot; tabs indentation; src/ imports.
- Thai copy from the mockup.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas for every endpoint).

- Mockup: `MembershipRenewal` — `ui-mockup/YEC-Lamphun.html` ~lines 913–1597.
- `src/app/api/v1/membership/renewals/**`; `src/app/api/v1/system-settings/**`; ADRs 0015–0018; `src/modules/membership/` (renewal module).
- README §8 gap ledger items 4 (phone discrepancy — this page uses 053-511-168 per mockup) and 5 (static fee/PDPA copy).
