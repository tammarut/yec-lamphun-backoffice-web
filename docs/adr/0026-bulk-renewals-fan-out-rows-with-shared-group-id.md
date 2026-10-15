---
status: accepted
---

# Bulk renewal submissions fan out rows stamped with a shared group_id

A bulk Renewal Submission (one payment slip, one main member + up to five additional, six members total) inserts **one `membership_renewals` row per member** — all sharing the same `payment_slip_file_path` — inside a **single transaction**, stamped with a shared nullable `group_id` column (native Postgres `uuid`, minted as UUIDv7 by a new `UuidV7Generator implements IIdGenerator` behind a dedicated DI token; `NULL` = solo submission, no backfill). Any ineligible member (not found / `RESIGNED` / already has a live `PENDING_REVIEW` renewal) aborts the **whole batch** — all-or-nothing — with the offending member named inside the canonical `{ error_message }` response. The request contract changes `member_id` → `member_ids: number[1..6]` on **both existing endpoints** (`POST /renewals` and `POST /renewals/manual`) rather than adding parallel `/bulk` routes. This ADR records the design settled in the issue-#50 grilling session; implementation lands via the spec + tracer tickets cut from it.

## Why

### 1. The one-to-many is the right write model; the group is a marker, not an entity
Every member-side effect of a submission is per member (Renewal Cache Columns writes, the partial unique index `idx_one_pending_renewal_per_member`, the review guard of ADR-0018), so a bulk is naturally N independent renewal rows. What the fan-out alone loses is the fact that those N rows were *one payment*. A nullable `group_id` restores that fact at the cost of one column + one partial index (`WHERE group_id IS NOT NULL`), needs no backfill (every existing row was a solo), and keeps ADR-0024's one-repository-per-table shape — no new table, repository, or DI surface beyond the ID generator.

### 2. An identifier, not a boolean — and UUIDv7 through the seam
A boolean (`is_group`) says *that* a row belongs to some group but not *which*; sibling discovery, group size, and any "ส่งพร้อมกัน N คน" badge are uncomputable, and the migration costs the same as an identifier. Slip-path equality was also rejected as a group key: it is an unenforced heuristic (the manual endpoint accepts arbitrary path tokens). Format choice: UUIDv7 (time-ordered, equivalent to ULID) minted by a `UuidV7Generator implements IIdGenerator` registered under its own Symbol token — through the DI seam so services stay mockable, keeping the existing `ID_GENERATOR`/ULID binding for Member File paths untouched. Column type: native `uuid`, so the database rejects malformed markers (22P02) instead of silently fragmenting groups; sqlc and both drivers treat it as `string`, so the repository layer sees no difference from `TEXT`.

### 3. All-or-nothing on any conflict
One payment covers the group and the fee was priced on the group (main 5,000, each additional 4,000, committee −500/member — display-only), so a half-created group would disagree with the money facts. All-or-nothing is also the default under the existing machinery: one transaction, and the partial unique index firing 23505 on any conflicting member rolls everything back. Partial success (savepoints or split transactions) would leave a group that was priced as a whole only partially recorded, and the submitter must fix-and-resubmit regardless — the response therefore names the offending member(s) and reason instead of partially succeeding. The diagnosis rides the canonical `{ error_message: string }` shape (AGENTS.md §2D); no structured error body is introduced.

### 4. Extend the existing endpoints, not parallel /bulk routes
The two submission channels already encode the submission-kind fork in their URLs (public + optional cookie per ADR-0015; staff-only clock-advancing per ADR-0016), and the form's single `manual` flag drives the hook. Changing `member_id` → `member_ids[1..6]` (unique entries, order is client-side display only — index 0 is the main member) keeps one endpoint per kind instead of four routes. This is a **breaking change** to both live contracts; it was chosen deliberately because the only consumers are this repo's own frontend and the Apidog test collection, which move in lockstep with the code.

### 5. Review stays per record; business mixing is a warning
The group is a payment fact, not a review fact. Each renewal keeps its independent lifecycle; rejecting one member of a five-member group (e.g. one who resigned after submitting) while approving the rest must remain possible, so group-atomic review was rejected. An "approve the whole group" affordance, if ever wanted, is N independent guarded PATCH calls or a thin endpoint looping the same per-row logic — one member's 409 never rolls back the others. Same-business membership is likewise NOT enforced server-side: groups may mix businesses (a form warning only), because the domain treats a group as "renew together under one payment," not "same business". The read model gains `group_id` + `group_size` (via `COUNT(*) OVER (PARTITION BY group_id)`) on Membership Renewal List rows so the worklist can badge same-payment rows; both list reads stay member-centric (one row per member) — a bulk never duplicates a member in a list.

## Considered options

- **Fan-out rows + shared `group_id` marker (chosen).** One column restores the one-payment fact; no new entity, no backfill, grouping survives admin slip-path reuse.
- **Fan-out only, no marker.** Rejected: the one-payment fact survives only as the unindexed, unenforced heuristic that slip paths are equal — impossible to reconstruct honestly later, and the fee roles (who was the 4,000-baht additional?) are unrecoverable.
- **Boolean `is_group` marker.** Rejected: cannot express *which* group; same migration cost as an identifier, strictly less capability; its index is near-useless.
- **`membership_renewal_submissions` parent table** (slip + payment date on the parent, renewal rows FK to it). Rejected for now: the group becomes a first-class entity enabling batch review and per-submission fee audit, but that costs a migration + backfill, a new repository (ADR-0024), DI tokens, and read-model joins while buying nothing today that the marker doesn't. Revisit when group-level *operations* become real requirements.
- **Partial success on conflict.** Rejected: leaves a group that was priced as a whole only partially recorded; all-or-nothing is the one-transaction default anyway.
- **Parallel `/bulk` endpoints.** Rejected: freezes the old contracts but forks the route surface into four endpoints; the breaking change was accepted because all consumers move in lockstep.

## Consequences

- Old `member_id` request bodies on both endpoints start failing validation (400) the moment this ships; the frontend hook and both Apidog specs + test collections must be updated in the same release.
- A bulk shares one `payment_date_at` (stamped server-now in one transaction), so the Membership Renewal List's existing sort (`payment_date_at DESC`, member id DESC) clusters group members adjacently even before the badge exists.
- The fee stays display-only and unpersisted — nothing fee-related is ever sent or stored; `group_id` preserves everything a future fee audit would need to reconstruct pricing.
- Every historical renewal row keeps `group_id IS NULL` forever, which is truthful: each was a solo submission.
- Reviewer identity remains unrecorded (pre-existing accepted gap, unchanged by grouping).
