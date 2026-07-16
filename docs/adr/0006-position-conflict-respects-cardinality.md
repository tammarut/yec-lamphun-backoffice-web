# Position-conflict check respects cardinality, deviating from the OpenAPI spec

The create-member position-conflict check (OpenAPI spec step 7: "if input position already exists → 409 Conflict") only fires for positions whose `cardinality` is `SINGLE`. Positions with `cardinality = MULTIPLE` never conflict on this rule, no matter how many members already hold them.

## Why

The spec's literal text ("if input position already exists → 409") is inconsistent with the position cardinality model. `GENERAL_MEMBER` and all `COMM_*` positions are `MULTIPLE` — they are designed to have many holders. Reading the spec literally would make it impossible to add a second `GENERAL_MEMBER`, which directly contradicts the schema and the entire point of the cardinality column.

The check is therefore interpreted as: *an already-held position conflicts only when the position admits exactly one holder.* This is almost certainly what the spec author intended; the unconditional wording is treated as an imprecision.

## Considered options

- **Respect cardinality (chosen).** Query `positions.cardinality`; only `SINGLE` positions trigger 409 when an active holder already exists. Consistent with the data model.
- **Follow the spec literally.** Any held position conflicts → 409. Rejected: makes a second `GENERAL_MEMBER` impossible, breaking the `MULTIPLE` cardinality that was deliberately designed.

## Consequences

- The duplicate-position check in `CreateNewMemberService` reads `positions.cardinality` and short-circuits for `MULTIPLE` positions.
- The check is a friendly-error optimization, not the correctness mechanism: the real guard against a second `SINGLE`-position holder is the per-position partial unique index on `members(position_code)` (only `PRESIDENT` is materialized today; the others are enforced in the service layer pending the runtime "create position" flow).
- Any future edit to the OpenAPI spec should reflect this rule so the spec and implementation agree.
