---
status: accepted
---

# Renewal Stat counts read only Renewal Cache Columns; the expired badge includes latest-rejected members

`GET /api/v1/membership/renewals/stat` serves the three badge counts above the renewal-review table (`total_expired_members`, `total_pending_review_members`, `total_approved_members`) from **one aggregated `COUNT(*) FILTER` query over the `members` table alone** — `membership_renewals` is never joined. The expired count follows the spec's pseudocode **literally**: `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'`, making it a deliberate superset of the Expired Membership List (which keys on `status = 'EXPIRED'` alone). The query is the renewals module's first **static** read and lives on the **sqlc** channel (ADR-0010's letter: dynamic reads go Bun SQL native, static stays sqlc).

## Why

### 1. Spec-literal OR for the expired count
The two candidate definitions diverge only for a member whose latest renewal is `REJECTED` while their Member Status is not `EXPIRED`. No reject flow exists today (renewal statuses transition only at submission), so the definitions currently coincide — but they won't necessarily coincide forever. We chose the spec's literal `OR` over aligning with the list because the spec is the API designer's contract, the clause is defensive (it self-heals cache-column drift toward "count them as expired"), and the alternative would silently deviate from a contract we were handed. The divergence risk (badge says 5, Expired tab shows 4 rows) is accepted and pinned in `CONTEXT.md` under **Renewal Stat**.

### 2. Cache columns only, no join
The Renewal Cache Columns exist precisely to avoid joining `membership_renewals` on member reads; a badge query is the ideal consumer. Cost: the counts key off the denormalized mirror, while the two list reads additionally verify a live renewal row (`mr_latest.id IS NOT NULL`). Under cache drift the badge and tab can disagree — accepted, same drift class as decision 1. Also a consequence, not a bug: the three counts are **not a partition** (a member who went `EXPIRED` again while its latest renewal is still `APPROVED` appears in two badges) — exactly how the two list tabs already overlap.

### 3. sqlc, not Bun SQL
ADR-0010 routes *dynamic* reads to Bun SQL and keeps *static* queries on sqlc; this query has zero parameters and no runtime-composed fragments, so sqlc owns it (typed codegen, precedent: the members module's `CountMemberByIdCardHash` / `CountActiveHolderByPosition`). The two list reads stay Bun SQL because their WHERE shape varies (search + keyset fragments). Note for regenerating: local sqlc ≥1.31 infers `expires_at` params as `Date | null`; the repo deliberately binds ISO strings (`toPgDate`, the Bun.SQL Date quirk), so the committed generated type stays `string`.

## Consequences

- Badge counts may legitimately exceed the corresponding tab's row count in two scenarios: latest-renewal-`REJECTED` members who are not (yet) Member Status `EXPIRED`, and cache-column drift. Both are documented, not errors to "fix".
- `::int` casts in the SQL keep counts as JS numbers (BIGINT would arrive as a string); `COUNT` with no `GROUP BY` always returns one row, with a zeros fallback in the repo mirroring the members module's count pattern.
- The endpoint is public (`security: []`, like both sibling GETs) — the response is three bare counts with no member PII.
