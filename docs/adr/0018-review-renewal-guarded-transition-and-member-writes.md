---
status: accepted
---

# Review-renewal is a guarded state transition; the approve write is shared with the manual flow

`PATCH /api/v1/membership/renewals/{renewal_id}/review` (staff-only, `withAuth`) is the review API the domain reserved since ADR-0015/0016: it decides a live `PENDING_REVIEW` renewal — approve (`ACTIVE`, Membership Expiry re-stamped, `renewal_successful_count` +1) or reject (`EXPIRED`, mandatory reason) — and both member-side writes stay owned by the renewals repository inside one transaction, like every renewal flow before it.

## Why

### 1. The transition guard (deliberate deviation from the spec's SQL)
The OpenAPI pseudocode checks `status != 'PENDING_REVIEW'` BEFORE the transaction and leaves the UPDATE unguarded — check-then-write. Two concurrent reviews of the same renewal both pass the pre-check and both commit: a double count-bump/expiry-stamp, or worse an approve+reject interleave that leaves an `EXPIRED` member carrying an `APPROVED` renewal. The UPDATE therefore carries `AND status = 'PENDING_REVIEW' AND deleted_at IS NULL` in its WHERE and is generated as `:execrows`; zero rows updated inside the transaction → `RenewalAlreadyReviewedError` → 409 (auto-rollback). This mirrors the public create flow, whose real race protection is the partial unique index rather than its pre-check. The pre-check read is retained for the clean 404/409 fast path; the guard is what makes it true under concurrency.

### 2. The transition rule lives on the aggregate
`membership-renewal.ts` explicitly reserved "the renewal *state machine* … lands here when that API ships." It ships: a `fromDb` factory reconstitutes the renewal, and a `review()` method owns the terminal-state rule (`PENDING_REVIEW` only) plus the outcome (status pair, rejection reason, expiry on approve via `computeMembershipExpiry`). The service orchestrates read → `review()` → write and maps errors; it does not re-implement the rule as an `if`.

### 3. One approve write for two flows
The spec's approve-path member UPDATE is column-identical to `UpdateMemberOnManualRenewal` (ACTIVE, APPROVED, `expires_at`, count+1). The query is renamed `UpdateMemberOnApprovedRenewal` and shared by the manual-create and review-approve paths — one SQL statement for one semantic write, no drift. Reject gets its own two-column `UpdateMemberOnRejectedReview` (EXPIRED, REJECTED). The spec's `CASE WHEN status='REJECTED'` on `rejection_reason` is dropped as redundant: the transition guard guarantees the row was `PENDING_REVIEW` (reason NULL), so binding the decision's reason-or-null directly is equivalent.

### 4. Spec-literal member outcomes; supersede gap remains open
Reject sets Member Status `EXPIRED` unconditionally, per spec. Edge case accepted: a stale `PENDING_REVIEW` renewal (superseded by a manual renewal that left it pending) can still be reviewed — reject would expire a member who just paid via the manual path, approve would double-stamp. The renewal list only surfaces a member's *latest* renewal, so the UI does not offer the stale row; building a real supersede model here would be piecemeal. The full current-vs-historical distinction stays deferred exactly as ADR-0015/0016 left it — do NOT "just widen the index."

### 5. Reviewer identity is not recorded
The spec neither sends nor stores a reviewer; the table has no column (only `reviewed_at`/`rejection_reason`). The session does carry a username, but adding an audit column is unrequested scope — the glossary's "with reviewer" claim was corrected instead. If an audit trail becomes a requirement, add a column + migration then.

## Considered options

- **Service-level status check, aggregate untouched** (mirror of the create flow). Rejected: the domain file reserved this exact home, and the status-pair-on-aggregate precedent (`create`/`createManual`) already exists.
- **Literal spec SQL (unguarded UPDATE)**. Rejected: loses the race; the 409 contract becomes best-effort.
- **Duplicate the approve member UPDATE under a review-specific name**. Rejected: two copies of one semantic write would drift.
- **Record reviewer now** (migration + `reviewed_by`). Rejected: unrequested; single-admin backoffice reality; easy to add later.

## Consequences

- The module's first `:execrows` sqlc query (row count drives the 409); all others stay `:exec`/`:many` per ADR-0001.
- The rename touches the manual flow's generated import and call site — a mechanical change, verified by its existing tests.
- The status/reason pairing (REJECTED requires non-empty reason; APPROVED requires none) is validated at the route boundary as a Valibot cross-field `check` — a pure function of the request body, per AGENTS.md §2C — returning the spec's literal 400 message "status and reason are incorrect".
- `renewal_successful_count` is incremented only in SQL (`count + 1`), never read-then-written in TS — no lost updates.
- Success is 204 with an empty body (matches the members PATCH precedent).
