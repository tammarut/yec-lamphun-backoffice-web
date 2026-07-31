import type { DatabaseError } from "src/shared/core/errors/app-error"

// DELETE /api/v1/members/:id is idempotent with no 404 path (grilling Q2): a
// syntactically valid id always returns 204, whether the member is active,
// already soft-deleted, or never existed. Row-level idempotency is enforced by
// the repository's `deleted_at IS NULL` guards; the route never inspects row
// counts. The only failure mode is therefore a database/transaction error → 500,
// so the error union collapses to DatabaseError alone.
export type DeleteMemberError = DatabaseError
