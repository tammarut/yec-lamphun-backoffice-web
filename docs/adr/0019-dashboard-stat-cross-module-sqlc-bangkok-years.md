---
status: accepted
---

# Dashboard Stat: a cross-module sqlc read block, spec-literal buckets, Bangkok wall-clock years

`GET /api/v1/dashboard/stat` serves the Dashboard Stat — five headline counts (`total_members`, `total_active_members`, `total_expired_members`, `total_businesses`, `total_members_each_year`) — from a NEW `src/modules/dashboard/` module that reads the members-owned tables (`members`, `member_business`) through its own sqlc block. The endpoint is public (`security: []`, like every sibling GET), takes one optional query parameter (`lookback_years`, integer 1–20, default 5 applied in the route), and its only failure mode is infra (`DatabaseError` → 500).

## Why

### 1. A new module with its own sqlc block, not the members module
The dashboard reads two tables the members module owns (ADR-0005), and modules never cross-import. Options were (a) grow a dashboard use case inside the members module, or (b) a new dashboard module whose sqlc.yaml block references the members/member_business/business_categories schemas purely for FK parsing. We chose (b) — the symmetric mirror of what ADR-0013/0014 established between members and renewals (each module owns its own queries over the other's tables via its own sqlc block). Dashboard concerns stay out of the members module, and the pattern now has three precedents instead of a special case.

### 2. Spec-literal "not yet renewed" bucket, diverging from the Renewal Stat
The dashboard spec defines `total_expired_members` as `status IN ('EXPIRED', 'PENDING_RENEWAL')` — "ยังไม่ได้ต่ออายุ" (not yet renewed). The Renewal Stat's same-named field (ADR-0017) is `status = 'EXPIRED' OR latest_renewal_status = 'REJECTED'`. Two public endpoints now serve the same field name with different definitions; we kept both spec-literal rather than renaming or aligning, because each spec is its endpoint's contract. The divergence (a `PENDING_RENEWAL` member counts as "expired" here but not there; a latest-renewal-`REJECTED` member counts there but not here) is pinned in `CONTEXT.md` under **Dashboard Stat**. Consequence to accept, not fix: the numbers are not expected to match. `RESIGNED` members additionally count toward `total_members` and the yearly breakdown but neither status bucket — the three member counts do not sum.

### 3. Bangkok wall-clock years, deviating from the spec pseudocode
`member_since` is TIMESTAMPTZ. The spec pseudocode's bare `EXTRACT(YEAR FROM member_since)` buckets by the DB session timezone (an deployment accident, likely UTC), and its `current_year` comes from the app server clock — two unpinned policies that disagree for ~7 hours around every New Year, in the wrong direction for a Thai chamber (a member joining New Year's Eve 23:30 Bangkok time would land in the previous year under UTC). We pinned ONE policy in TWO places: the SQL groups by `EXTRACT(YEAR FROM (member_since AT TIME ZONE 'Asia/Bangkok'))`, and the service computes the zero-fill window's current year via `Intl.DateTimeFormat(..., { timeZone: 'Asia/Bangkok' })`. Both are deterministic regardless of DB/app server timezone. The `min_year` filter also lives in SQL as a bound int, not `CURRENT_DATE - INTERVAL` arithmetic — the window is decided by the same JS clock that zero-fills it.

### 4. sqlc for all three queries, including the parameterized one
ADR-0010's letter: static query text → sqlc, dynamic composition → Bun SQL native. All three dashboard queries are static text; only the yearly query takes a runtime parameter. Precedent for parameterized sqlc already existed (`CountActiveHolderByPosition` takes `$1`), so the yearly query is sqlc too — one idiom per repository. sqlc-quirk notes for regeneration (sqlc ≥1.31): a bare `$1` compared against an `EXTRACT(...)` expression mis-infers the param as `member_since`'s `Date` — the named form `sqlc.arg(min_year)::int` pins it to `number`; and the analyzer rejects alias references in `GROUP BY` (CTE or derived table alike) — `GROUP BY 1` works.

## Consequences

- The Renewal Stat and the Dashboard Stat can report different `total_expired_members` values at the same instant; `CONTEXT.md` documents why. If a UI shows both, they must not be placed as if comparable.
- `total_active_members + total_expired_members ≤ total_members`, with equality only when no member is `RESIGNED` — dashboards must not assume the three sum.
- `total_members_each_year` keys always serialize ascending (JS orders integer-like object keys numerically regardless of insertion order); the spec pseudocode's descending fill order is not representable in a JSON object and was dropped without loss.
- Regenerating the dashboard sqlc block requires local sqlc ≥1.31 with the `sqlc.arg(min_year)::int` / `GROUP BY 1` forms kept (see decision 4).
- The endpoint is public — the response is bare aggregate counts with no member PII, matching the renewal-stat precedent's reasoning.
