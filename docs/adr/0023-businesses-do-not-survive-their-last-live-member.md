---
status: accepted
---

# Businesses are shared data that do not survive their last live member

The `businesses` entity extracted from `member_business` (spec #66) has a life of its own as **data** — it is shared, so an edit through any linked member updates the one row every linked member sees — but it has no life of its own as a **record**: when the member soft-delete cascade removes the last live `members.business_id` pointer to a business, the same transaction soft-deletes the business row. A business is never kept as a memberless record. This yields the standing invariant **non-deleted business ⇔ ≥1 live member**, which is what lets the dashboard's `total_businesses` stay a plain count of non-deleted rows and what releases a soft-deleted business's `juristic_registration_no` for re-registration (the live-rows-only partial unique index).

## Why

- The delete decision runs under `SELECT ... FOR UPDATE` on the businesses row, inside the same transaction as the member's own soft-deletes. Two staff deleting the last two co-linked members concurrently serialize on the lock: the loser finds `deleted_at` already set, gets no row from the lock query, and skips the cascade. Without the lock, both could count each other as "another live member" and the business would leak as a memberless row.
- The cascade is idempotent end to end: every UPDATE carries `deleted_at IS NULL`, and an already-deleted business makes the lock query return no row, so a re-delete of a member is a 0-row no-op that still returns 204 (grilling Q2's contract, unchanged).
- **Considered**: keeping businesses alive after their last member (an archive, for future "reactivate" features). Rejected: there is no restore API, no business CRUD in scope, and re-registration recreates the business under the live-rows-only uniqueness rule — an archive would only rot. (#61 resolution, reaffirmed at cutover #72.)
- **Considered**: leaving the transaction inside the repository as before (ADR-0013's shape), deciding the cascade in SQL where no unit test can see it. Rejected for this flow: the AC requires service-level tests for the three behaviors (business survives when other live members remain / soft-deleted on the last live link / re-delete idempotent), so the transaction moved to `DeleteMemberService`, which orchestrates tx-scoped repository steps — the same `DatabaseClient.transaction` pattern `create`/`update` already use internally. ADR-0013's ownership rule is unchanged: the members module still owns the renewals cascade; only the orchestration seam moved.
- Supersedes ADR-0005's premise that a business row is a 1:1 member-owned child. ADR-0002 (R2 upload flow) and ADR-0007 are unaffected — uploads still produce member-scoped keys that `businesses.logo_file_path` / `product_file_path` store by reference (#63). ADR-0012's null-sticky file paths still hold, resolved against the shared row. ADR-0013's module ownership of the cascade is unchanged, though the cascade's shape (which tables, which decision) is what this ADR redefines.

## Consequences

- `DeleteMemberService` injects `DatabaseClient` and owns the delete transaction; `IMemberRepository` gains tx-scoped step methods (`findLiveBusinessIdForCascade`, the soft-deletes, `countLiveMembersByBusinessId`, `softDeleteBusinessById`) that throw `DatabaseError` inside the transaction — the create/update transaction-internal style, now shared by all three flows.
- Editing business fields through any linked member is visible through every linked member (wholesale overwrite of the shared row via `UpdateBusinessById`). There is no per-member business copy anymore.
- The live-DB flip happens at the #72 merge via `businesses-migration.sql` (one transaction; the #65-locked script with the canonical-supplies `location` rule). The in-repo DDL is the end state: `members.business_id BIGINT NOT NULL` + `fk_members_business ON DELETE RESTRICT`.
- Until #69 lands, a create/edit that would duplicate a live `juristic_registration_no` fails at the index → 500. #69 replaces that with the contract's 409s.
