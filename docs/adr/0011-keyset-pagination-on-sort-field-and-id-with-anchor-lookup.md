# Keyset pagination on `(sort_field, id)` with anchor-row lookup

The GET-list-members endpoint paginates with a cursor. The cursor's **wire value is always a `members.id`** (e.g. `"11"`), but the pagination predicate is built on the **current sort field**, with `id` appended as a deterministic tiebreaker. Because the cursor carries only the id, building the predicate for page N+1 requires a cheap lookup of the anchor row's sort-field value first. A cursor whose anchor row no longer exists returns `400 Invalid cursor` (logged at `warn`).

## Why

The endpoint supports three sort fields (`created_at`, `first_name_th`, `expires_at`) in two directions each. Of these, only `id` (which is not a valid sort field on its own) is unique — `created_at` collides whenever two members are inserted in the same transaction or within the same millisecond, `first_name_th` collides constantly (many "สมชาย"), and `expires_at` is nullable. A naive predicate built on the sort field alone (`WHERE created_at < $anchor`) is **non-deterministic across ties**: rows sharing the anchor's timestamp may appear on both page N and page N+1, or be skipped entirely, depending on the planner's tiebreak choice. The result is a list that visibly duplicates or drops rows as the user scrolls — the worst class of pagination bug because it's silent and intermittent.

The fix is the standard keyset pattern: order by the tuple `(sort_field, id)` and predicate on the same tuple. The `id` is appended as the final tiebreaker in the **same direction** as the sort, so the sort key becomes a total order with no ties, and the cursor predicate `(sort_field, id) <op> ($anchor_sort, $cursor_id)` is unambiguous. This is stable across deletes, inserts, and ties — the textbook property of keyset pagination that offset-based pagination cannot achieve.

Because the cursor wire format is a bare id (per the spec's `next_cursor: "11"` example), the predicate needs the anchor row's sort-field value, which is not in the cursor. The cheapest correct way to get it is one extra indexed lookup — `SELECT <sort_field> FROM members WHERE id = $cursor` — before the main query. This is one round-trip per scrolled page, against the PK; negligible cost. The alternative (encoding the sort value into the cursor, e.g. base64 `{created_at, id}`) would save the lookup but couple the cursor's wire format to the sort field, make cursors opaque and hard to debug, and contradict the spec's bare-id example.

### NULL handling

`expires_at` is nullable (`TIMESTAMPTZ`, no `NOT NULL`). Postgres's default NULL ordering is `NULLS LAST` for `DESC` and `NULLS FIRST` for `ASC` by default in queries but is **not guaranteed consistent** across the predicate and the `ORDER BY` unless stated explicitly. The implementation must specify `NULLS LAST` for DESC and `NULLS FIRST` for ASC on both the `ORDER BY` clause and treat the keyset comparison accordingly, so that null-`expires_at` members cluster at one end of every page sequence and the keyset predicate remains a total order. Without explicit NULLS handling, a null sort value in the middle of a sequence produces undefined keyset behavior.

### Anchor row deleted between pages

Between the client's page N and page N+1, the anchor member may have been soft-deleted (`deleted_at` set) or hard-deleted. The anchor lookup then returns no row, and the sort-field value needed for the keyset predicate is unavailable. Three responses were considered:

- **`400 Invalid cursor` (chosen).** The boundary the client holds is stale; continuing is impossible without it. The client must restart from page 1. Honest and actionable; the cost is one restart in a rare edge case.
- **`200` with empty page.** Silently lies — the list has not ended, the cursor rotted. The client would render "no more members" when members still exist.
- **Fall back to first page.** Surprising; duplicates rows the client already has.

This applies only to a **well-formed** cursor (positive integer) whose target row is gone. A structurally-invalid cursor (non-numeric, zero, negative) is rejected by the Valibot schema at parse time as `400` before the lookup runs.

## Considered options

- **`(sort_field, id)` keyset with anchor lookup (chosen).** Stable across ties; honest about deleted anchors; cursor wire format stays a bare id matching the spec. Cost: one PK lookup per scrolled page, plus one ADR to record the pattern.
- **Encode the sort value into the cursor** (e.g. base64 JSON `{sort_value, id}`). Saves the anchor lookup. Rejected: contradicts the spec's bare-id cursor example, makes cursors opaque, and couples the wire format to the sort field (a cursor issued under `sort_by=created_at` is meaningless under `sort_by=first_name_th`, which must then be detected and rejected — more complexity, not less).
- **Naive `id`-boundary cursor** (`WHERE id < $cursor` regardless of sort). Simplest; the `ORDER BY` uses the chosen sort but the predicate is always on `id`. Rejected outright: `id` order has no defined relationship to `first_name_th` or `expires_at` order, so page 2 overlaps or skips rows relative to page 1. Unusable for any non-id sort.
- **Offset-based pagination** (`?page=2&page_size=10`). Rejected: offset pagination degrades as the offset grows (the DB scans and discards `offset` rows on every request), and is unstable under inserts/deletes — a new row inserted before the user's current window shifts every subsequent page by one, causing duplicates or skips. Keyset has neither problem.

## Consequences

- The cursor wire format is `string | null`: a positive integer rendered as a string, or `null` when `has_more` is false (no next page). Clients send the cursor back unchanged. Changing this format would break every outstanding cursor, so it is fixed by this ADR.
- `has_more` and `next_cursor` are computed by fetching `LIMIT (n + 1)` rows: if `n + 1` rows come back, the nth row's id is `next_cursor` and `has_more = true` (the nth row is dropped from the response); otherwise `has_more = false` and `next_cursor = null`.
- Sort fields are restricted to a closed enum (`created_at`, `first_name_th`, `expires_at`) validated by Valibot. The `ORDER BY` column is spliced into the query as `sql.raw(validatedEnumValue)` — safe because the value is enum-checked, not user-free-text. The direction (`asc` / `desc`) is likewise enum-checked. Values (`status` array, `search` string, `cursor` id, `limit`) are always bound parameters, never `sql.raw`.
- The anchor-lookup + main-query pattern means **two SQL statements per scrolled page** (one on the first page, where there is no cursor and thus no lookup). This is acceptable for a backoffice browse endpoint; if it ever isn't, the remedy is the encode-the-sort-value-into-cursor option above, which this ADR records as the available escalation.
- The deleted-anchor case returns `400` with `{ error_message: "Invalid cursor" }` and is logged at `warn` (not `error` — it is a client-visible, recoverable condition, not an infra fault). The structural-invalid-cursor case (non-numeric) returns `400` from the schema layer with no lookup and no log.
