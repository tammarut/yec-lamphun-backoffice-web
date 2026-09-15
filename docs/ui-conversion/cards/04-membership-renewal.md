[UI-04] Membership renewal — ระบบต่ออายุสมาชิก

## Goal

The renewal workflow at `/renewal`: an open/closed system gate, filter stat cards, a status-tabbed member area with server-side search — the ยังไม่ได้ต่ออายุ filter renders a **sectioned worklist** (pinned ไม่อนุมัติ panel above a หมดอายุ table) — plus the admin review/manual-renewal actions and the renewal form (slip upload + PDPA consent + display-only fee summary).

**Mockup v3 resync (2026-09-13)** redesigned this page after issue #49 was created; this card and the issue carry the resynced plan. Session decisions (2026-09-13, all by the user):
- **Rejected reason + date ARE in scope** — no endpoint returns them today, so the PR opens with a small backend read-model extension (unit 1 below).
- **วันหมดอายุ column dropped** — the หมดอายุ section shows วันที่เป็นสมาชิก (`member_since`, already in the response) instead of expires_at.
- **Additional-members block (②) DEFERRED** — the API takes one `member_id` per POST; the UI ships main-member-only until the bulk endpoint exists (tracked in its own issue; link in Out of scope).
- **Fee summary rail ships display-only** — client-side math on the static rates, nothing sent to the API (README §8 item 5 still governs the copy).

Do this after card 03 — it reuses the member-autocomplete and file-upload patterns established there.

## Route & files

- `src/app/(public)/renewal/page.tsx` — stub exists; replace its content.
- `src/modules/membership-renewals/components/` — `renewal-gate.tsx` (closed state / admin toggle), `renewal-stats.tsx`, `renewal-worklist.tsx` (sectioned ยังไม่ได้ต่ออายุ view), `renewal-table.tsx` (รอตรวจสอบ / ปกติ tabs), `renewal-form-dialog.tsx`, `review-dialog.tsx`, `slip-viewer.tsx`.
- `src/modules/membership-renewals/hooks/` — data hooks (stat, list per status, expired, latest-renewal detail, system-settings).

_(Resync note: the card originally pointed at `src/shared/components/renewal/` — that path predates ADR-0022; feature UI lives in the module per AGENTS.md, same as card 03 shipped.)_

## Backend prerequisite (unit 1 — read-model extension, user decision 2026-09-13)

The v3 ไม่อนุมัติ panel needs each rejection's **reason + date**; no response carries them (the DB columns `membership_renewals.rejection_reason` + `reviewed_at` exist — the review flow writes them). Extend, in the same PR as the UI:

- `GET /api/v1/membership/renewals/expired` — rows gain `rejection_reason: string | null` + `rejected_at: string | null` (the `reviewed_at` of the latest REJECTED renewal; null when the latest renewal isn't rejected).
- `GET /api/v1/membership/renewals/{member_id}` — `renewal` gains the same two fields (feeds the review dialog's คำขอต่ออายุที่ไม่อนุมัติ variant).
- sqlc query/read-model changes + service mapping + tests; OpenAPI JSON edit; **Apidog sync markdown delivered** (user pastes + re-exports per the standing workflow).

No other backend change: statuses, transitions, and endpoints are all live (ADR-0015–0018).

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

## UI structure (from mockup v3, ~lines 1240–1990)

Mockup: `MembershipRenewal` component, `ui-mockup/YEC-Lamphun.html` (v3, committed 06787bf).

- **Gate**: system closed + not admin → full-page state ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ + contact card (phone 053-511-168 per mockup — see README §8 item 4).
- **Admin toggle**: เปิด/ปิด switch pill wired to `PATCH /system-settings`; red warning banner when closed: ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้).
- **Fee banner**: blue gradient card — ค่าธรรมเนียม 5,000 บาท/กิจการ; ส่วนลด: กิจการเดียวกันท่านที่ 2 → ชำระเพียง 4,000 บาท, คณะทำงาน YEC Lamphun → ลด 500 บาท/คน. Static copy.
- **3 clickable stat cards** (from `/stat`): ยังไม่ได้ต่ออายุ / รอตรวจสอบการโอน / ปกติ (ต่ออายุแล้ว) — clicking filters the area below (`expired` endpoint / `PENDING_REVIEW` / `APPROVED`). The ยังไม่ได้ต่ออายุ count is the /stat superset (EXPIRED **or** latest REJECTED), matching the mockup's Pending+ContactStaff count.
- **Search bar** — server-side, debounced, per active filter (ค้นหาชื่อ หรือ เบอร์โทรศัพท์...).
- **ยังไม่ได้ต่ออายุ → sectioned worklist** (v3 centerpiece; renders for admin AND member, admin-only bits gated):
  - **Pinned ไม่อนุมัติ panel** = expired rows whose `latest_renewal_status === "REJECTED"`. Collapsible header — admin: "ไม่อนุมัติ — ต้องติดตาม / คำขอต่ออายุที่ถูกไม่อนุมัติ ต้องติดต่อสมาชิกเพื่อดำเนินการใหม่"; member: "ไม่อนุมัติ — กรุณาติดต่อเจ้าหน้าที่ / สมาชิกที่คำขอต่ออายุถูกไม่อนุมัติ กรุณาติดต่อฝ่ายข้อมูลและทะเบียนสมาชิก". Red styling + count badge when >0; GREEN all-clear state when 0 (admin "จัดการคำขอทั้งหมดแล้ว" / member "สถานะการต่ออายุของสมาชิกทุกท่านเป็นปกติ"). Rows: avatar · name (nickname) · pill ไม่อนุมัติ (admin) / กรุณาติดต่อเจ้าหน้าที่ (member) · rejected date · business · **admin-only เหตุผล: {rejection_reason}** · admin actions ดูสลิป/เหตุผล (slip viewer) + ต่ออายุ (Manual).
  - **หมดอายุ — ยังไม่แจ้งต่ออายุ section** = the remaining expired rows; header count; table สมาชิก · ประเภท · **วันที่เป็นสมาชิก** (member_since — user decision, NOT วันหมดอายุ) · [admin] ดำเนินการ (ต่ออายุ (Manual)); ordered by member id (เรียงตามรหัสสมาชิก); client-side +10 "แสดงเพิ่มเติม (เหลืออีก N ราย)" paging (hidden while searching); empty ไม่พบข้อมูล.
- **รอตรวจสอบ / ปกติ tabs → single table**: สมาชิก (avatar, name+nickname, phone) · ประเภท (คณะกรรมการ/สมาชิกทั่วไป) · วันที่เป็นสมาชิก · [admin] วันที่ทำรายการ (`payment_date_at`) · สถานะ badge · [admin] ดำเนินการ. Status pills: รอตรวจสอบ (PENDING_REVIEW, yellow) / ปกติ (APPROVED, green).
- **Row actions (admin)**: รอตรวจสอบ → ตรวจสอบ/อนุมัติ (review dialog); approved → เรียบร้อย + eye icon (slip viewer).
- **Primary button** แจ้งชำระเงิน / ต่ออายุ — opens the renewal form (member mode).
- **Renewal form dialog** — member mode "แจ้งต่ออายุสมาชิก" / admin manual mode "ต่ออายุสมาชิก (ผู้ดูแลระบบ)", numbered sections: **① สมาชิกที่ต่ออายุ** — autocomplete from `/members?search=` (prefix search on first name/phone/position — the mockup deliberately mirrors the API's semantics; selected state renders as a member CARD with avatar · business · current status, clearable in member mode, readonly in manual mode); **② สมาชิกเพิ่มเติม DEFERRED — not in this PR** (see Out of scope); **③ หลักฐานการโอนเงิน (Slip)** — required, dropzone + preview + ลบไฟล์, `payment_slip` field, 7MB/image checks mirroring card 03's client validation; **④ หนังสือให้ความยินยอม (PDPA)** — expandable detail (อ่านรายละเอียด ▾) + required consent checkbox gating submit. **Right rail**: สรุปค่าธรรมเนียม (display-only computed total: 1 คน 5,000 / 2+ 4,000, −500/คน คณะทำงาน — with only one member it reads 5,000/รวม), static KBANK card (ธนาคารกสิกรไทย · YEC LAMPHUN · 207-8-13870-2), 1–2 วันทำการ note. Footer: รวมทั้งสิ้น N บาท · ยกเลิก / ส่งข้อมูล (member) or อนุมัติ (admin manual). Missing-field submit → red summary list (เลือกสมาชิกที่ต่ออายุ / แนบหลักฐานการโอนเงิน (Slip) / ยอมรับหนังสือให้ความยินยอม (PDPA)). **In-dialog success screen** (v3): ต่ออายุสำเร็จ / ส่งข้อมูลเรียบร้อยแล้ว + สถานะ line + ปิด button.
- **Review dialog** — title varies by row state: ตรวจสอบการชำระเงิน (pending) / หลักฐานการโอนเงิน (approved) / คำขอต่ออายุที่ไม่อนุมัติ (rejected). ข้อมูลสมาชิก grid (ชื่อ-สกุล, ชื่อเล่น, กิจการ, เบอร์โทรศัพท์, ประเภทสมาชิก) + rejected rows show เหตุผลที่ไม่อนุมัติ (เมื่อ {rejected_at}) from unit 1's fields; slip panel (presigned URL from `GET [member_id]`); อนุมัติ / ไม่อนุมัติ → reason textarea (placeholder เช่น สลิปไม่ชัดเจน, ยอดเงินไม่ถูกต้อง...) → ยืนยันไม่อนุมัติ. Approved/rejected rows see ปิดหน้าต่าง only.

## shadcn components to add

None expected beyond card 03's set (table, tabs/checkbox, dialog, switch, alert, skeleton all exist by now).

## Task breakdown

**PR split (2026-09-13, user decision): THREE PRs, each reviewed separately.** PR 1 = the backend unit alone (tiny, fastest review, lands the Apidog sync earliest). PR 2 = the read-side UI — the page ships as a live read-only review board (gate, toggle, stats, worklist, tables, slip viewer) with NO write affordances yet. PR 3 = the write flows (form dialog, review dialog, manual renewal) — this PR closes #49. Each PR runs /scrutinize before opening; each branches off main after the previous one merges.

**Split amendment (2026-09-15, user decision):** PR 2 narrowed further — it ships ONLY the sectioned ยังไม่ได้ต่ออายุ worklist (expired endpoint, panel + หมดอายุ table, search, cursor load-more, PR 1's rejection fields). The remaining read-side items — gate + admin เปิด/ปิด toggle, stat cards, the รอตรวจสอบ/ปกติ table, and the slip viewer — move to **PR 2b** (`feature/ui-04d-renewal-read-2b`), which lands before PR 3. Rationale: keep each PR reviewable at PR 1's size; the regular-table/slip-viewer UI pairs naturally with PR 3's dialogs anyway.

### PR 1 — backend read-model extension (`feature/ui-04a-rejection-fields`, Refs #49) — **SHIPPED as PR #52** (merged 2026-09-15, `c20c703`)

- Expired list + GET `{member_id}` responses gain `rejection_reason` + `rejected_at` (sqlc read model + service mapping + route tests + service tests).
- OpenAPI JSON edit + Apidog sync markdown deliverable (user pastes + re-exports per the standing workflow).

> Shipped note: the expired-list read is the Bun-SQL dynamic query (ADR-0010), not sqlc — rejection fields derive via `CASE WHEN mr.status = 'REJECTED'` in the SQL so an approval's `reviewed_at` never leaks as `rejected_at`.

### PR 2 — read-side UI, expired worklist (`feature/ui-04b-renewal-read`, Refs #49) — **SHIPPED as PR #53** (merged 2026-09-15, `2562af1`) — scope per the 2026-09-15 amendment

- Hooks: the `expired` endpoint list with debounced `search` + cursor (useInfiniteQuery pattern copied from card 03's `use-members`; search lives in the query key so pages reset on term change).
- Sectioned ยังไม่ได้ต่ออายุ worklist (client-split by `latest_renewal_status`: REJECTED panel incl. the admin เหตุผล line from PR 1's fields + หมดอายุ section with the member_since column + +10 reveal paging, hidden while searching); Renewal Status pill (audience-aware REJECTED wording); cursor load-more button; states (skeleton / ไม่พบข้อมูล / error+retry) + responsive (stacked rows under 768px, horizontally scrollable table) + tests (worklist split, admin gating, green all-clear, PR 1's fields consumed).
- NOT in this PR (→ PR 2b): gate + toggle, stat cards, รอตรวจสอบ/ปกติ table, slip viewer; NOT in this PR (→ PR 3): all row action buttons.

> Shipped notes (both scrutiny gates ran — in-session /scrutinize: ship; Antigravity Gemini 3.8-Flash High: fix-then-ship, fixed in `a85a969`): (1) **no business/department line on rejected rows** — the expired DTO has no such field (API wins over the mockup); (2) **the หมดอายุ count badge is intentionally ABSENT** (Antigravity Nit 1, user decision) — a client-accumulated count reads as a total that keyset pagination cannot promise; the PR 2b stat card owns the authoritative number (the panel count badge stays — rejected rows are ordered first, so it is exact once any non-rejected row is seen); (3) hook `limit=20` (within the API's 1..100, mirrors card 03's `MEMBERS_PAGE_LIMIT`).

### PR 2b — read-side remainder (`feature/ui-04d-renewal-read-2b`, Refs #49) — NEXT

- Gate (closed member state / admin red banner) + admin เปิด/ปิด toggle (PATCH /system-settings, optimistic update) — the only write there, and it's settings, not renewals.
- Hooks: stat; per-filter regular list keyed by `status` (รอตรวจสอบ/ปกติ) with debounced search + cursor; latest-renewal detail.
- Stat cards; รอตรวจสอบ/ปกติ table; slip viewer (eye action, presigned URL). Still NO renewal write affordances — those are PR 3.

### PR 3 — write flows (`feature/ui-04c-renewal-write`, closes #49)

- Renewal form dialog: ① member autocomplete from `/members?search=` (debounced prefix search; selected state = member card with avatar · business · status; readonly in manual mode); ③ slip upload (uploads-first: POST `/file/upload` once, then `POST /renewals` or `/manual` with the returned `payment_slip_file_path`); ④ PDPA consent gating submit; display-only fee rail; missing-field summary list; in-dialog success screen; 409 pending-exists / 403 resigned / 404 surfaced inline from `{ error_message }`. (② สมาชิกเพิ่มเติม stays deferred to #50.)
- Review dialog: per-state title variants (ตรวจสอบการชำระเงิน / หลักฐานการโอนเงิน / คำขอต่ออายุที่ไม่อนุมัติ); rejected rows show เหตุผลที่ไม่อนุมัติ (เมื่อ {rejected_at}); approve / reject-with-reason; 409 already-reviewed → inline message + list refetch; slip from `GET /renewals/{member_id}` (1-hour presigned URL; expired preview recovers by refetching).
- Row actions wired into the PR 2 tables: ตรวจสอบ/อนุมัติ (pending), ต่ออายุ (Manual) (pending/rejected rows); invalidate stat + active list on every successful write.
- Form + review + wiring tests; the card-level acceptance-criteria walk below completes in this PR.

## Out of scope

- **สมาชิกเพิ่มเติม (②) block + bulk submission** — the API takes one `member_id` per POST; deferred until a bulk endpoint exists. Tracked in issue #50 (created 2026-09-13). The form ships main-member-only; the fee rail renders the single-member 5,000 total.
- Fee/discount EDITING (static copy — README §8 item 5; the fee rail is display-only math, nothing is sent to the API).
- Email/notifications; PDPA text legal review; editing/re-submitting a rejected renewal online (rejected members re-contact staff, who use Manual renewal).

## Acceptance criteria

- [x] Unit 1 landed: expired list + `GET {member_id}` carry `rejection_reason` + `rejected_at`; OpenAPI edited; Apidog sync markdown delivered. *(PR #52)*
- [ ] Closed system shows the member gate; admin sees the toggle + can flip it (persists via PATCH). *(→ PR 2b)*
- [ ] Stat cards render counts from `/stat` and filter the area below on click (ยังไม่ได้ต่ออายุ → expired endpoint). *(→ PR 2b)*
- [x] ยังไม่ได้ต่ออายุ renders the sectioned worklist: pinned ไม่อนุมัติ panel (reason + date on rows for admin, collapsible, green all-clear when none) above the หมดอายุ section (member_since column, +10 load-more). *(PR #53; the mockup's business line on rejected rows is dropped — the expired DTO has no such field; the หมดอายุ count badge is deliberately absent — see the PR 2 shipped notes.)*
- [ ] Server-side search works per active filter; cursor load-more works (รอตรวจสอบ/ปกติ) and the หมดอายุ client paging works. *(expired half done in PR #53 — search + cursor load-more + +10 paging; รอตรวจสอบ/ปกติ search + cursor → PR 2b)*
- [ ] Member renewal form submits end-to-end: autocomplete → slip upload → consent → 201; in-dialog success screen; status becomes รอตรวจสอบ (admin manual mode → ปกติ).
- [ ] Admin review dialog approves and rejects-with-reason (per-state title variants, rejected rows show reason + date); 409 already-reviewed surfaces inline; slip viewer shows the presigned image.
- [ ] Fee banner + display-only fee rail render; manual renewal works for pending/rejected rows; all states reachable; admin-only elements hidden when logged out; `bun run lint` + `bun run test` green.

## AI implementation prompt

The card-level prompt served its purpose across PRs 1–2; per the card-03
convention, this block now carries the NEXT session's full kickoff prompt
(PR 2b). PR 3's prompt gets authored here when PR 2b merges.

```text
Implement PR 2b of UI-04 (four-PR plan per the card): the read-side
remainder — Refs #49, does NOT close it.

Read first: AGENTS.md; the card docs/ui-conversion/cards/04-membership-renewal.md
(esp. "PR 2b" in Task breakdown + the PR 2 shipped notes); CONTEXT.md renewal
terms (Expired Membership List, Renewal Cache Columns, Renewal Stat, Status
Badge); the mockup v3 in ui-mockup/YEC-Lamphun.html (Membership Renewal page —
gate, admin toggle, fee banner, stat pills, รอตรวจสอบ/ปกติ table, review/eye
slip preview). Then the live code — the shipped PR 2 worklist
(src/modules/membership-renewals/components/ + hooks/, especially
renewal-worklist-view.tsx and use-expired-memberships.ts — reuse their
patterns: query-key search, renewal-labels, format-thai-date,
renewal-status-badge, the renderView test harness) and the endpoints:
GET/PATCH /api/v1/system-settings (src/modules/system-settings/),
GET /api/v1/membership/renewals (+stat), GET /api/v1/membership/renewals/[member_id].

Scope (per the card's PR 2b section — the card is the source of truth):
1. Gate: system closed + not admin → full-page ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ
   state + contact card (053-511-168); admin still sees the page + red banner
   ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้).
2. Admin เปิด/ปิด toggle → PATCH /system-settings with optimistic update
   (the only write here — settings, not renewals).
3. 3 clickable stat cards from GET /renewals/stat (ยังไม่ได้ต่ออายุ superset /
   รอตรวจสอบการโอน / ปกติ (ต่ออายุแล้ว)) — clicking filters the area below;
   the ยังไม่ได้ต่ออายุ stat card is the authoritative count the PR 2 worklist
   badge intentionally does not show.
4. รอตรวจสอบ/ปกติ table from GET /renewals?status= (สมาชิก · ประเภท ·
   วันที่เป็นสมาชิก · [admin] วันที่ทำรายการ · สถานะ pill · [admin] ดำเนินการ
   placeholder-only — actions wire in PR 3) with debounced search + cursor
   load-more copied from the PR 2 hook.
5. Slip viewer (eye action on approved rows) via GET /renewals/{member_id}
   presigned URL; expired preview recovers by refetching.
6. Fee banner (static copy, README §8 item 5) + client types + hooks +
   components + tests (jsdom recipes apply); look&feel match to mockup v3,
   never pixel-perfect; API wins on any contradiction; admin-gated copy per
   card 03 conventions. NO renewal write affordances (PR 3).

Workflow: branch feature/ui-04d-renewal-read-2b off updated main; commit per
unit. TWO scrutiny gates BEFORE the PR, both required:
  Gate 1 — run /scrutinize in this session as usual.
  Gate 2 — deliver a paste-ready Antigravity scrutinize prompt (self-contained
  block naming the branch, the diff range vs main, the card's PR-2b section as
  the spec axis, and the acceptance criteria) so the same review runs in
  Antigravity IDE (Gemini 3.8-Flash High) as an independent second model. STOP
  and wait for the findings paste-back. Dispose of each finding ID (fix, or
  prove already-correct with evidence), commit the fixes, then push and open
  the PR (Refs #49 — NO closing keywords); never merge. Surface questions as
  decisions (options + recommendation).
Definition of done: functional in browser, Thai copy checked, tests green,
bun run lint + bun run test green, BOTH scrutiny gates run and their findings
dispositioned, Antigravity verdict noted in the PR body.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas; the deprecated `/file/presign` path was removed in the 2026-09-13 re-export).

- Mockup v3: `MembershipRenewal` — `ui-mockup/YEC-Lamphun.html` (committed `06787bf`; component ~lines 1240–1990).
- `src/app/api/v1/membership/renewals/**`; `src/app/api/v1/system-settings/**`; ADRs 0015–0018; `src/modules/membership-renewals/` (renewal module — its `components/` + `hooks/` are the UI homes per ADR-0022).
- README §8 gap ledger items 4 (phone discrepancy — this page uses 053-511-168 per mockup) and 5 (static fee/PDPA copy).
- Deferred follow-up issue: [#50](https://github.com/tammarut/yec-lamphun-backoffice-web/issues/50) — bulk renewal endpoint + the สมาชิกเพิ่มเติม (②) form block.
