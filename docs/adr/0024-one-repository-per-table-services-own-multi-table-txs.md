---
status: accepted
---

# One repository per table inside the members module; services own every multi-table transaction

The members module's persistence is split per table: `IMemberRepository` / `MembersRepository` own the `members` + `positions` rows and the member-centric reads; `IBusinessesRepository` / `BusinessesRepository` own the shared `businesses` write side plus the whole ADR-0023 delete-cascade boundary (FOR UPDATE gate, live-link count, soft-delete); `IMemberDocumentsRepository` / `MemberDocumentsRepository` own the `member_documents` mutations. There is deliberately **no repository for a module's read JOINs**: reads that project business columns onto member-centric queries (`getMemberDetailById`, the list, latest-renewal single-view, org chart) stay single-query in `MembersRepository` — one round-trip per read, unchanged shapes.

The transaction rule becomes uniform: **every multi-table transaction is owned by its use-case service**, which injects `DatabaseClient`, opens one `DatabaseClient.transaction`, and calls tx-scoped step methods on the per-table repositories (create: businesses → member → documents; update: member → business → document replace; delete: lock → documents → renewals → member → count → conditional business). Repositories never open transactions and never call each other; their step methods take the service's `tx` handle and throw `DatabaseError` so the transaction auto-rollbacks. This generalizes ADR-0023's delete-flow rule to create and update.

## Why

- A single `MembersRepository` implementing five tables had grown to ~900 lines mixing four roles (checks, multi-table writes, tx-scoped cascade steps, reads). The split gives each repository one table's responsibility and each service visible ownership of its transaction — the cascade's lock/count/decide sequence is now readable in `DeleteMemberService` instead of buried in repository internals.
- **"One interface = one table" was never the house rule** — `IMembershipRenewalRepository` (members-cache writes, ADR-0014) and `IDashboardRepository` (members + businesses reads, ADR-0019) already span tables by recorded decision. What this ADR changes is the members module only, and only at the repository layer.
- **Table colocation is unchanged**: `businesses`, `member_documents`, `positions`, and the renewal soft-delete SQL all stay inside the members module (ADR-0005's colocation decision, ADR-0013's ownership). The sqlc layer is untouched — one queries.sql per module, so the split is purely at the repository/interface layer; `sqlc generate` is a no-op for this refactor.
- **Considered**: repos calling sibling repos inside repository-owned transactions (keeps services thin). Rejected: repo→repo injection is a new coupling pattern, hides the cross-table flow one layer down, and would leave the create/update/delete flows governed by two different tx-ownership rules.
- **Considered**: splitting the read JOINs per table too (detail = member + business + documents assembled from three queries). Rejected: pure overhead — extra round-trips and JS-side assembly for zero behavior change; a read JOIN is a member-centric projection, not a business/document responsibility.
- **Considered**: leaving the structure as-is and only documenting the convention. Rejected by product choice: the interface-size pain was real enough to pay a mechanical, test-covered move.

## Consequences

- New DI tokens `BUSINESSES_REPOSITORY` / `MEMBER_DOCUMENTS_REPOSITORY`; the businesses and documents repositories hold **no connection of their own** (all methods tx-scoped; only `MembersRepository` keeps a `DatabaseClient` for its Result-style reads and checks).
- `CreateNewMemberService` and `UpdateMemberService` gain `DatabaseClient` + the per-table repositories; `DeleteMemberService` swaps its single repository for three. `execute()` signatures are unchanged, so routes and route tests are untouched; the three command-service test files were rewired to the new seams.
- `toPgDate` / `toPgArray` moved to `src/shared/lib/db/pg-serializers.ts` — the first shared Bun.SQL serialization helpers. (`MembershipRenewalsRepository` keeps its own pre-existing private `toPgDate` variant with different throw-on-missing semantics — intentionally untouched.)
- ADR-0013 stands: the membership_renewals soft-delete SQL remains in the members module's repository (now as a tx-scoped step), with its parse-time DDL reference — the one deliberate cross-table leftover.
- ADR-0005's colocation decision is unchanged; this ADR supersedes only its implicit single-repository consequence.
- The businesses FOR UPDATE gate still depends on `business_id` being immutable post-creation (see the locking note on `FindLiveBusinessIdForCascade` in the members queries.sql) — now documented on `IBusinessesRepository.findLiveBusinessIdForCascade` as well.
