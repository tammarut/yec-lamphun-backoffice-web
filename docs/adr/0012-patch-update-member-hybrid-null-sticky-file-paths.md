# PATCH /members/:id uses hybrid semantics — JSON null on a file-path field means "leave unchanged"

`PATCH /api/v1/members/:id` requires the full `CreateNewMemberRequest` object (every key present, matching POST's required-field list), but the five **file-path** fields treat JSON `null` as "leave the existing stored value untouched," while every scalar field (names, phone, email, etc.) writes through — including nulls that clear the column. The five sticky fields are the three top-level paths `profile_avatar`, `id_card_image`, `company_certificate` and the two nested business paths `business.logo`, `business.product`.

## Why

The spec pseudocode carries conditional guards — step 7 "*If profile_avatar not null, then set profile_avatar*", step 12 "*If company_certificate or id_card_image not null ...*" — that only make sense if `null` is a non-destructive sentinel. A strict full-replace would let `profile_avatar: null` (sent by a staff form that didn't re-upload) silently wipe a member's avatar and orphan the uploaded R2 object. The same orphaning risk applies to the two business file paths.

The hybrid reading keeps the form-friendly property (client always sends the whole object; no need to omit keys) while making the destructive case deliberate: to *clear* a file path you'd send a non-null sentinel (out of scope for now) or use a dedicated endpoint. Scalar nulls remain destructive because explicitly clearing an email/line_id is a legitimate edit and there's no orphaning concern.

## Considered options

- **Hybrid, all 5 file paths sticky (chosen).** Scalars write through; the 5 file-path fields are sticky on null. Matches the spec's conditional guards; rule is easy to state ("file paths are sticky, scalars aren't"). Prevents accidental orphaning of uploaded files on edit.
- **Strict full-replace.** All keys required and always written; `null` on a file path clears it. Simpler, but contradicts the spec pseudocode's `if not null` guards and lets a careless form submission destroy uploaded documents.
- **True partial PATCH.** All fields optional; only sent keys update, absent keys unchanged. Would diverge from the spec's required-field list and need a separate all-optional schema.

## Consequences

- The `UpdateMemberService` reads the stored member (via `getMemberDetailById`) before building the UPDATE so it can substitute the existing file-path value wherever the request sent `null`. This read is also the existence check (→ 404) and supplies the stored `id_card_no_hash` / `position_code` for the conditional conflict checks.
- The `Member.update()` aggregate factory and the repository's UPDATE statements receive resolved (non-null) file-path values for the 5 sticky fields; the stickiness never reaches SQL.
- Null on any *non-sticky* nullable column (`email`, `line_id`, `shirt_size`, `title_name_en`, `business.address`, `business.core_business`, `business.website`) writes NULL and clears the value — this is intentional and reversible by a subsequent edit.
- Soft-delete (not hard delete) is used when a file-path field is replaced: the old `member_documents` row(s) of the replaced type get `deleted_at = NOW()`, then the new row is inserted, preserving version history consistent with the rest of the module.
