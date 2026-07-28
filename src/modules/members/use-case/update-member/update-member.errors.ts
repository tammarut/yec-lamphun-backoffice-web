import type { CryptoError } from "src/modules/shared/crypto"
import type { DatabaseError } from "src/shared/core/errors/app-error"
import type { MemberValidationError } from "src/modules/members/domain/errors"
import type { MemberConflictError } from "../create-new-member/create-member.errors"
import type { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"

// Re-export so use-case consumers can import all error types from one place.
// PATCH reuses the existing member error classes verbatim — no PATCH-specific
// error subclass is needed (grilling Q10). MemberConflictError's `reason`
// discriminator already covers both PATCH conflict cases (DUPLICATE_ID_CARD,
// POSITION_OCCUPIED).
export { MemberValidationError } from "src/modules/members/domain/errors"
export { MemberConflictError } from "../create-new-member/create-member.errors"
export { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"

/**
 * Union of all errors an update-member flow can return. The route's mapError
 * branches on instanceof to pick the right status code:
 *   - MemberValidationError → 400
 *   - MemberNotFoundError   → 404
 *   - MemberConflictError   → 409 (reason ∈ DUPLICATE_ID_CARD | POSITION_OCCUPIED)
 *   - CryptoError | DatabaseError → 500
 */
export type UpdateMemberError = MemberValidationError | MemberNotFoundError | MemberConflictError | CryptoError | DatabaseError
