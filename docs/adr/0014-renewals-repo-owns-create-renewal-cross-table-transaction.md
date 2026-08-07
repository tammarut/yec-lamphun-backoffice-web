---
status: accepted
---

# Renewals repo owns the create-renewal cross-table transaction

`POST /api/v1/membership/renewals` writes to two modules' tables in one DB transaction: `INSERT INTO membership_renewals` (renewals module) **and** `UPDATE members SET status, latest_renewal_status` (members module). AGENTS.md §1 forbids cross-module TS imports, and ADR-0013 explicitly deferred this exact cross-module transaction problem, saying it "must be re-resolved" once renewals gained a real TS layer — which this API does. We decided that **the `MembershipRenewalsRepository` owns the entire transaction**, including the `UPDATE members` of the two Renewal Cache Columns. Its sqlc block references `members/repository/sql/schema.sql` for FK/type parsing only — the symmetric mirror of how the members block already references `membership_renewals/repository/sql/schema.sql` for the cascade soft-delete (ADR-0013).

## Why

Filing a renewal is a renewal-aggregate lifecycle event. The two columns it writes on `members` (`status`, `latest_renewal_status`) are Renewal Cache Columns — a denormalized mirror *of the renewal's own state* — so renewals writing them is coherent, not a boundary violation. This also matches the create-member precedent (ADR-0005): one module owns the multi-table transaction boundary for its aggregate. Keeping the transaction inside one module's repository (rather than an orchestrator over two repos) preserves the ADR-0005 rejection of thin coordinators and avoids leaking the low-level `Sql` tx handle up to a service.

## Considered options

- **Renewals repo owns the transaction (chosen).** Renewal create is a renewal-aggregate event; the member-status write maintains a cache OF the renewal's state. The renewals sqlc block references members schema for parsing only — symmetric with ADR-0013. Supersedes ADR-0013's forward note cleanly.
- **Members repo owns it** (like it owns the cascade soft-delete, ADR-0013). Rejected: the renewal-create *logic* — status pre-check, `PENDING_REVIEW` insertion, the member-status transition — is renewal-domain logic and would have to live in the members module, contradicting ADR-0013's stated direction that renewals become its own aggregate. The soft-delete is a member-lifecycle concern; renewal *creation* is not.
- **Orchestrator service over two repos** sharing a `Sql` tx handle. Rejected: ADR-0005 explicitly rejected this thin-coordinator pattern for create-member, and it leaks the `Sql` type (a driver-level concern) up into the service layer, coupling two modules via a shared low-level type.

## Consequences

- The renewals module's sqlc block now references the members schema "only so its FK resolves during parsing" — the exact phrasing already in the members block. A code reviewer seeing `members/repository/sql/schema.sql` in the renewals block should consult this ADR.
- This **supersedes the forward-looking note in ADR-0013** ("If `membership_renewals` later gains a real TS domain layer... this decision should be revisited"). That revisit has now happened: the renewal create transaction lives in the renewals repo. ADR-0013's *own* decision (members repo owns the cascade *soft-delete*) stands unchanged — deletion is a member-lifecycle concern; creation is a renewal concern.
- The `MembershipRenewalsRepository` is the second module (after `MembersRepository`) that owns a transaction touching another module's table. This is the accepted shape for cross-aggregate denormalized writes in this codebase: the aggregate whose state is *the source of truth* owns the write, and references the other module's schema for parsing only.
