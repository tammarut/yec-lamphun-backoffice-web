---
status: accepted
---

# Every page stays publicly viewable — authorization lives at the API

All application routes live in the single `(public)` route group under `src/app/`, and that is deliberate: the group means "App Shell chrome + API-level authorization", not "publicly readable data". Pages render whatever their API returns — admin-only endpoints answer `401` via `withAuth`, and the page surfaces that as an inline degraded state (loading skeleton → error Alert with retry, e.g. `/members/[member_id]`, or a product-level closed gate, e.g. the renewal page per ADR-0015). There is no route-tier authorization: no middleware, no cookie check in a layout, no redirect or 403 page, and the `(private)` group sketched in AGENTS.md §1 stays empty until a page genuinely cannot render without a session. Decided 2026-11-12 with the member-detail spec (#141, "no redirect, no 403 page, no new auth machinery"); recorded as an ADR 2026-11-13 after PR #146's scrutiny (MAJOR-1) flagged that the convention lived only in page and layout comments.

## Why

### 1. The API is the only place authorization can actually protect data
Every read the UI shows comes from a `withAuth`-wrapped API route; a person who bypasses the UI entirely still hits that gate. Adding a cookie check at the route tier would create a second authorization source that can drift from the API's (a page that "blocks" a non-admin changes nothing about what the API would have returned to them, and a page that "allows" an admin still depends on the API enforcing it). One enforcement point, one place to audit.

### 2. The UI is already session-aware and degrades by design
Views gate actions on `isAdmin` from the session probe and render honest empty/error states when the API says no — the members list, the detail page, and the wizard all follow this shape. That is the product's answer to "what does a non-admin see": not a redirect, but a truthful reflection of what the API would give them. A `(private)` group would replace a working degradation contract with navigation friction and implied security it cannot deliver.

### 3. `(public)` naming is about shell ownership, not content classification
The layout comment ("every page stays publicly viewable by the locked UI decision") has been misread as "everything in here is public content". It is not: it means every route shares this App Shell and the same authorization contract. Staff-only data living behind a `(public)` group is therefore not a leak — the API denies the data to unauthenticated callers — and staff-only routes do not need to move groups as the app grows.

## Considered options

- **Keep one `(public)` group; authorization stays at the API (chosen).** One enforcement point, honest degraded states, zero new machinery.
- **Move staff-facing pages to a `(private)` group with a layout cookie check (rejected).** Duplicates the API's decision in a place that cannot protect the data, adds middleware the spec explicitly rejected, and invites drift between route-tier and API-tier rules (ADR-0015 already chose API-level enforcement for exactly this reason on the renewal flow).
- **Per-page redirects for non-admins (rejected).** Same duplication, plus lost deep-linkability and a worse error story than the inline states the views already render.

## Consequences

- New pages — including staff-only ones — go in `(public)` and render their API-denied states inline; reviewers should expect `withAuth` on the endpoint, not a route-group gate.
- The AGENTS.md §1 `(private)` sketch remains a placeholder: creating it requires revisiting this ADR with a page that genuinely cannot render anonymously.
- If a future requirement (e.g. legal) demands route-level gating, this ADR is the decision to reopen — the change would be a new group plus a documented cookie-check seam, not scattered per-page checks.
