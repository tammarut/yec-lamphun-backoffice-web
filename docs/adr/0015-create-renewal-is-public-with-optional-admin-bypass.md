---
status: accepted
---

# Create-renewal is public with an optional admin instant-approval bypass

`POST /api/v1/membership/renewals` is **public**: any caller may submit a renewal on behalf of a `member_id` without authenticating. When the request carries a **valid** staff `session_id` cookie, the renewal bypasses the review pipeline — it is inserted at Renewal Status `APPROVED` and the member's Member Status moves to `ACTIVE` (Admin Submission). Without a valid cookie, the renewal enters review at `PENDING_REVIEW` and the member moves to `PENDING_RENEWAL` (Public Submission). This reverses the "every write route is `withAuth`" stance (grilling Q7 on the prior member endpoints): the OpenAPI spec's `security: []` on this operation is honored literally here, because members themselves — not just staff — are intended callers.

## Why

A renewal is a member-facing action (a member pays and uploads a slip); gating it behind staff auth would block the very people it serves. Staff still need to act — but to record an in-person cash payment, they want to both file AND approve in one step rather than file-then-review. The optional-cookie model serves both: members file into the review queue; staff file-and-approve in a single call. Treating a present-but-invalid cookie as "not admin" (rather than 401) keeps the route's failure modes unified — it is public-first, and the cookie is purely an upgrade path, so an invalid cookie is observably the same as no cookie to the caller.

## Considered options

- **Public + optional admin bypass (chosen).** Route is unwrapped (`withAuth` removed); the handler does a soft inline `validateSession` and passes an `isAdmin` boolean to the service, which selects the status pair (`PENDING_REVIEW`/`PENDING_RENEWAL` vs `APPROVED`/`ACTIVE`). Invalid cookie = not admin, no 401. Matches the spec's `security: []` and the member-facing intent.
- **`withAuth` + a separate public endpoint.** Keep this route staff-only and add e.g. `POST /api/v1/membership/renewals/public`. Rejected: two endpoints for one domain action fragments the surface area, and the spec defines a single operation.
- **`withOptionalAuth` middleware (new).** A second middleware variant passing `SessionData | null`. Rejected as premature: this is the only optional-auth route today. Inline the soft check in the route (where AGENTS.md §2D puts auth concerns) and revisit if a second optional-auth route appears.
- **Invalid cookie → 401.** Rejected: adds a 401 path to a route the spec declares public, and leaks whether a session id is valid. Public-first means invalid ≡ absent.

## Consequences

- This route is the **first non-`withAuth` write route whose behavior forks on the cookie** (the file-upload route is public but cookie-agnostic). The inline soft check pattern is the template for any future optional-auth route.
- A single member can accumulate multiple `APPROVED` renewals via repeated admin submissions: admin approval lands the member on `ACTIVE`, the pre-check sees `ACTIVE` (not `PENDING_RENEWAL`) and proceeds, and the partial unique index `idx_one_pending_renewal_per_member` only covers `PENDING_REVIEW`. This is **accepted for now and explicitly deferred**, not designed-away — see "Known gap" below.
- **Known gap — no membership-period concept (deferred).** "Block a duplicate admin submit" is the right instinct, but this codebase has no notion of a membership period/cycle: `expires_at` is never bumped by renewal logic, there is no `renewed_for_period` column, and no current-vs-historical renewal distinction. So nothing can tell a *duplicate* admin submit apart from a *legitimate next-cycle* renewal — an `APPROVED` renewal from a prior period is still live when the member renews again. A correct "block" therefore requires introducing the missing concept (e.g. soft-delete/supersede the member's prior live `APPROVED` renewal on each new submission, plus widening the unique index to `WHERE status IN ('PENDING_REVIEW','APPROVED') AND deleted_at IS NULL`). That belongs to the future review/approve API, which is the natural home for the renewal lifecycle (approve, reject, supersede, renew-for-period). Until then, an admin double-submit produces a duplicate `APPROVED` row — messy data, not corrupting (the member just re-activates idempotently; `renewal_successful_count` is not even incremented today). Do NOT "just widen the index" without the supersede step: a live `APPROVED` row blocking all future renewals would break the periodic-renewal business model.
- The status values are no longer SQL literals in the generated queries: both the renewal `INSERT` and the member `UPDATE` take status as bound parameters (`$3`, selected by the service from `isAdmin`), so one query pair serves both submission kinds.
- The `isAdmin` flag is decided in the **route** (the only layer that touches `NextRequest`/cookies/container) and passed as a plain boolean on the request DTO; the **service** stays pure and testable with no auth/container coupling.
- This **supersedes grilling Q7** for THIS route only. The member CRUD routes (POST/PATCH/DELETE `/members`, PATCH `/system-settings`) remain `withAuth` staff-only — those are backoffice-only actions with no member-facing intent. Q7's reasoning still holds for them.
