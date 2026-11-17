---
status: accepted
---

# membership_renewals doubles as the membership payment ledger

The `membership_renewals` table is the per-member record of every membership payment event, discriminated by a `type` column (`'RENEWAL'` default, `'REGISTRATION'` for initial payments) — not a renewals-only table. A **Registration Payment** (a member's required first-fee slip, captured in the registration wizard's การชำระเงิน step) is inserted by the members module's create-member transaction as `type='REGISTRATION'`, born `status='APPROVED'`: evidence filed by the staff member who uploaded it, never reviewed, never advancing `expires_at` or `renewal_successful_count`. The member is `ACTIVE` from creation regardless — the slip is evidence for traceability, not a gate (registration is staff-only; there is no registration review pipeline, unlike renewals which are publicly submittable). This honors the standing rule that registration and renewal are different domain events: the shared table is a payment ledger, not a claim that a registration is a renewal.

## Why

- **Columns on `members` were considered and rejected**: the ledger gives one physical payment history per member (the detail-page timeline is a single chronological read of both types) and reuses `payment_slip_file_path` / `payment_date_at` exactly as they are; a 1:1 column pair on the wide members table would split the same fact across two homes.
- **`member_documents` (the dormant `PAYMENT_SLIP` type) was rejected**: a second `PAYMENT_SLIP` row (backfill, replace) makes "the initial slip" ambiguous, and document reads exclude the type by design.
- **A no-discriminator variant (a plain `APPROVED` row, no `type` column) was rejected explicitly**: the renewal worklist, the latest-renewal single view, and any renewal count would surface registration payments as renewals — a false record in the module's primary operational UI — and no other column reliably distinguishes them (`group_id` is NULL for solo renewals too; timestamps overlap on same-day events).
- **A dedicated `member_payments` table was rejected**: it drifts toward absorbing renewal payments (re-opening the very separation this decision protects) and adds a third payment home for no current need — fees are display-only and never persisted (ADR-0026).
- **Cross-module write precedent**: the members module's sqlc block already reads and writes `membership_renewals` (ADR-0013 cascade soft-delete, `GetLatestRenewalByMemberId`). The create-member transaction owning the REGISTRATION insert follows ADR-0014's rule — the aggregate whose state is the source of truth owns the write — mirroring how the renewals repo owns the member cache-column writes when a renewal is created.

## Consequences

- Every read with renewal semantics must filter `type = 'RENEWAL'`: the membership-renewal list read (main + anchor LATERALs), the expired-membership list read, and the members module's latest-renewal single view. Payment-history reads deliberately don't, composing both types into one per-member timeline. Renewal Stat is safe by construction (cache columns only, never joining the ledger); the review PATCH is unreachable for REGISTRATION rows (guarded on `PENDING_RENEWAL`, which they never hold); the group-size count never sees them (NULL `group_id`).
- `status='APPROVED'` on a REGISTRATION row means "evidence recorded by staff at registration," never "reviewed" — `reviewed_at` stays NULL, and `rejection_reason` / `group_id` are deliberately inert for these rows.
- At most one live REGISTRATION row per member, enforced by the partial unique index `idx_one_registration_payment_per_member`; the PATCH attach-or-replace path is an upsert on that index, and a replace re-stamps `payment_date_at` (the new slip's filing time — the column always means "server time of the write", matching renewal semantics).
- Existing renewal rows need no data migration — `type` defaults to `'RENEWAL'`. Existing members simply have no REGISTRATION row until staff backfill one via the edit wizard; the member detail page flags the gap for staff.
