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

### PR 1 — backend read-model extension (`feature/ui-04a-rejection-fields`, Refs #49)

- Expired list + GET `{member_id}` responses gain `rejection_reason` + `rejected_at` (sqlc read model + service mapping + route tests + service tests).
- OpenAPI JSON edit + Apidog sync markdown deliverable (user pastes + re-exports per the standing workflow).

### PR 2 — read-side UI (`feature/ui-04b-renewal-read`, Refs #49)

- Gate (closed member state / admin red banner) + admin เปิด/ปิด toggle (PATCH /system-settings, optimistic update) — the only write here, and it's settings, not renewals.
- Hooks: stat; per-filter lists (regular list keyed by `status` for รอตรวจสอบ/ปกติ, `expired` endpoint for ยังไม่ได้ต่ออายุ) with debounced `search` + cursor (keyset handling copied from card 03, resetQueries on stale-cursor 400); latest-renewal detail.
- Stat cards; sectioned ยังไม่ได้ต่ออายุ worklist (client-split by `latest_renewal_status`: REJECTED panel incl. the admin เหตุผล line from PR 1's fields + หมดอายุ section with the member_since column + +10 paging); รอตรวจสอบ/ปกติ table; slip viewer (eye action, presigned URL). NO write affordances — ตรวจสอบ/อนุมัติ and ต่ออายุ (Manual) arrive in PR 3.
- States (skeletons / ไม่พบข้อมูล / error+retry) + responsive (375px stacked cards, horizontally scrollable tables, 768px breakpoint) + tests (worklist split, admin gating, green all-clear, PR 1's fields consumed).

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

- [ ] Unit 1 landed: expired list + `GET {member_id}` carry `rejection_reason` + `rejected_at`; OpenAPI edited; Apidog sync markdown delivered.
- [ ] Closed system shows the member gate; admin sees the toggle + can flip it (persists via PATCH).
- [ ] Stat cards render counts from `/stat` and filter the area below on click (ยังไม่ได้ต่ออายุ → expired endpoint).
- [ ] ยังไม่ได้ต่ออายุ renders the sectioned worklist: pinned ไม่อนุมัติ panel (reason + date on rows for admin, collapsible, green all-clear when none) above the หมดอายุ section (member_since column, +10 load-more).
- [ ] Server-side search works per active filter; cursor load-more works (รอตรวจสอบ/ปกติ) and the หมดอายุ client paging works.
- [ ] Member renewal form submits end-to-end: autocomplete → slip upload → consent → 201; in-dialog success screen; status becomes รอตรวจสอบ (admin manual mode → ปกติ).
- [ ] Admin review dialog approves and rejects-with-reason (per-state title variants, rejected rows show reason + date); 409 already-reviewed surfaces inline; slip viewer shows the presigned image.
- [ ] Fee banner + display-only fee rail render; manual renewal works for pending/rejected rows; all states reachable; admin-only elements hidden when logged out; `bun run lint` + `bun run test` green.

## AI implementation prompt

```text
Implement UI-04 (membership renewal) in this repo — GitHub issue #49; this
card (docs/ui-conversion/cards/04-membership-renewal.md, mockup-v3 resync) is
the source of truth. Read, in order: AGENTS.md; CONTEXT.md (renewal terms);
this whole card; ADRs 0015–0018; the mockup MembershipRenewal component
(ui-mockup/YEC-Lamphun.html, v3); the live backend under
src/app/api/v1/membership/renewals/** + system-settings.

SHIPPED AS THREE PRs (user decision 2026-09-13 — one fresh session each,
each branches off main after the previous PR merges):

- PR 1 feature/ui-04a-rejection-fields (Refs #49): the backend read-model
  unit — expired list + GET /renewals/{member_id} responses gain
  rejection_reason + rejected_at (sqlc + service + tests + OpenAPI JSON
  edit + Apidog sync markdown deliverable).
- PR 2 feature/ui-04b-renewal-read (Refs #49): read-side UI — gate +
  admin toggle (settings write only), stat cards, sectioned ยังไม่ได้ต่ออายุ
  worklist, รอตรวจสอบ/ปกติ table, slip viewer; NO write affordances.
- PR 3 feature/ui-04c-renewal-write (closes #49): write flows — renewal
  form (member picker / slip / PDPA / display-only fee rail / in-dialog
  success), review dialog, manual renewal wiring, cache invalidations;
  the acceptance-criteria walk completes here. The สมาชิกเพิ่มเติม (②)
  block stays DEFERRED (#50) — main-member-only.

Constraints: TanStack Query + fetchJson ({ error_message }); never write
Member Status directly — only via the renewal endpoints; semantic OKLCH
tokens; cn(); data-slot; tabs; src/ imports; RHF + valibot (ADR-0021);
Thai copy from the mockup; fee/PDPA copy static.

Each PR: /scrutinize before opening; never merge. Definition of done per
PR: its Task-breakdown section + bun run lint + bun run test green; the
card's acceptance criteria are walked one by one in PR 3.
```

## References

- API spec: `docs/openapi/api-yec-lamphun-backoffice-web.openapi.json` (Apidog export, OpenAPI 3.1 — full request/response schemas; the deprecated `/file/presign` path was removed in the 2026-09-13 re-export).

- Mockup v3: `MembershipRenewal` — `ui-mockup/YEC-Lamphun.html` (committed `06787bf`; component ~lines 1240–1990).
- `src/app/api/v1/membership/renewals/**`; `src/app/api/v1/system-settings/**`; ADRs 0015–0018; `src/modules/membership-renewals/` (renewal module — its `components/` + `hooks/` are the UI homes per ADR-0022).
- README §8 gap ledger items 4 (phone discrepancy — this page uses 053-511-168 per mockup) and 5 (static fee/PDPA copy).
- Deferred follow-up issue: [#50](https://github.com/tammarut/yec-lamphun-backoffice-web/issues/50) — bulk renewal endpoint + the สมาชิกเพิ่มเติม (②) form block.
