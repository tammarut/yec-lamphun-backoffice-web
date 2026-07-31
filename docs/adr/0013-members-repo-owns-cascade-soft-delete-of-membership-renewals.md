# Members repository owns the cascade soft-delete of membership_renewals

`DELETE /api/v1/members/:id` soft-deletes four tables in one DB transaction: `member_documents`, `member_business`, `membership_renewals`, then `members`. `member_documents` and `member_business` already live inside the `members` module (ADR 0005), but `membership_renewals` is a separate top-level module (`src/modules/membership-renewals/`). AGENTS.md §1 forbids cross-module TS imports, so `MembersRepository` cannot call a `MembershipRenewalsRepository`. We decided that **`MembersRepository` owns the entire atomic cascade transaction**, including the `membership_renewals` soft-delete, and the renewals soft-delete SQL is generated inside the **members** `sqlc.yaml` block by adding `membership-renewals/repository/sql/schema.sql` to that block's `schema:` list — a DDL-level parse-time reference only, **not** a TS import. This mirrors how the members block already references `business-categories/repository/sql/schema.sql` "only so its FK resolves during parsing." No `membership_renewals` service/repository/use-case layer is created for this API.

## Why

The delete is a member-lifecycle operation; one module must own the transaction boundary (ADR 0005 made the identical call for member *create*). Keeping `membership-renewals/` as its own module preserves it as the future home for the renewal review-workflow aggregate (its `status` state machine, reviewer, `reviewed_at`, and the partial-unique "one pending renewal per member" index all signal a genuine independent aggregate, unlike the 1:1 `member_business` child). Generating the single soft-delete query in the members sqlc block respects the no-cross-import rule while leaving the renewals module available for renewal-specific read/write use-cases later.

## Considered options

- **Members repo owns the cascade (chosen).** One module owns the transaction; renewals schema is a parse-time DDL reference in the members sqlc block; renewals stays a separate module for its future aggregate. Matches ADR 0005's reasoning.
- **Full colocation into members.** Move `membership_renewals` DDL into the members module (mirror `member_business`). Rejected: the renewal review state machine gives renewals an independent lifecycle, so they are not a 1:1 member child.
- **Dedicated member-deletion orchestrator module.** Create a module above `members` and `membership-renewals`, each with its own repository, orchestrating the transaction. Rejected: ADR 0005 explicitly rejected this thin-coordinator pattern for create, and AGENTS.md discourages modules whose only consumer is one orchestrator.

## Consequences

- `MembersRepository.softDeleteMember(id)` is the single owner of the 4-table transaction; it has no dependency on a renewals repository.
- The members `sqlc.yaml` block references `membership-renewals/repository/sql/schema.sql` for FK parsing only — a code reviewer seeing a "foreign" schema in the members block should consult this ADR.
- If `membership_renewals` later gains a real TS domain layer (review workflow use-cases), this decision should be revisited: the renewal soft-delete query may want to migrate to a renewals repository, at which point the cross-module transaction problem (the original ADR 0005 trigger) returns and must be re-resolved (e.g. via an orchestrator or domain events).
