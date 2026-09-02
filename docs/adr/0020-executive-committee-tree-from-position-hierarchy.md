---
status: accepted
---

# Executive Committee: a tree derived from the position hierarchy, with Vacant Position placeholders

`GET /api/v1/members/executive-committee` serves the Executive Committee — the org-chart tree for the backoffice chart page: every non-deleted, non-RESIGNED member holding any position except `GENERAL_MEMBER`, nested from the position hierarchy with the President holder at the root, served by a new use case in the members module (`get-executive-committee`, reusing `MEMBERS_REPOSITORY` + `MEMBER_FILE_URL_SERVICE`). The endpoint is public (`security: []`, like every sibling GET), takes no parameters, and its only failure mode is infra (`DatabaseError` → 500). Sibling order is `(positions.display_order, members.id)`; `position` on the wire is `positions.name_th` (Thai).

## Why

### 1. Derive the tree from `positions.parent_position_code`; the spec's pseudocode is stale
The spec builds the tree from a stored `members.parent_id` plus a code-level `POSITION_MAP` — both artifacts of the schema this codebase deliberately removed (the members schema header and `CONTEXT.md`'s **Supervisor**: supervisor is DERIVED at read time, never stored on a member). Re-adding `parent_id` would resurrect the reassignment chains that removal eliminated. Instead, two static sqlc reads — the whole `positions` table plus the flat member rows (LEFT JOIN `member_business` for `business_name`, soft-delete filter in the ON clause per `GetMemberWithBusinessById`) — feed a pure in-memory assembly: each occupied position's holders attach under the **first live holder** of their parent position (deterministic single attachment even for a MULTIPLE parent; every seeded parent-of-something is SINGLE anyway). Thai names come from `positions.name_th` because positions are runtime-managed via the admin UI — no code-level map could stay correct.

### 2. Vacant Position placeholders instead of walking members up or dropping them
When a rung has no live holder (VP resigned or never appointed) but live members sit below it, three behaviors were on the table: the spec pseudocode's silent drop (hides real members), walking the members up to the nearest held ancestor (flattens depth), or materializing a **placeholder node** for the missing position — `id: null`, member fields null, Thai title present. We ship placeholders (the user's own proposal): the tree keeps its true shape, one shared placeholder per missing position (a missing chain materializes a chain), and the frontend detects vacancy via `id === null`. Placeholders are created only as attachment points for live descendants — an unheld position with nothing below it renders no node, so an empty advisory board adds nothing. The rule deliberately does NOT apply to the root: no live PRESIDENT holder → the response body is `null` (the spec's "return `{ [] }`" was invalid JSON, and its Empty example was a copy-paste from the renewals spec); the tree is anchored on the President or not rendered at all. The spec's `chidren` field spelling is fixed to `children` in both the implementation and the Apidog spec — we own the only consumer.

### 3. Corruption guards: cycles and unreachable chains attach to the root
The positions table is admin-managed with no cycle constraint on `parent_position_code`. The assembly therefore (a) iterates only codes with real member holders, captured before any placeholder is cached — iterating the map afterward would re-attach a placeholder under its own descendants, weaving a circular node graph; (b) carries a visited set along each parent-chain walk; and (c) checks, before attaching, that the attachment node is not inside the attaching node's subtree (a held A↔B cycle would otherwise circle). A second top-level position (parent NULL, not President) attaches directly to the root. In every corruption case the fallback is the same: attach to the root — visible, serializable, deterministic; nobody vanishes.

## Consequences

- The wire node widens `id` and all name fields to nullable — the price of placeholders; `position` (Thai title) is the only field every node carries. Clients must treat `id === null` as a vacancy card, not a member.
- Sibling order depends on the seed's parent-before-child `display_order` convention for placeholder placement between display-order neighbors; admin-created positions violating it still render deterministically, just with placeholder siblings ordered by first-trigger rather than strictly by `display_order`.
- `RESIGNED` committee members disappear from the chart entirely (status filter) — including, when the President resigns, the whole tree (`null`). That is the accepted reading of "the chart is anchored on a live President."
- The response is a single root object (or `null`) — not an array, not `{ data: [...] }`; the Apidog spec must be updated to match before this ships to the frontend team.
