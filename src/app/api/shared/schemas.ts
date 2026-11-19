import { minLength, pipe, string, trim } from "valibot"

/**
 * The shared payment-slip boundary primitive (scrutiny #154 F6): ONE definition
 * of the required, non-empty slip-path contract, composed by POST /members,
 * POST /membership/renewals, and POST /membership/renewals/manual. The 400
 * messages are documented API contract (OpenAPI export + Apidog TCs assert them
 * exact-match), so a tweak here is a contract change across all three endpoints
 * — never edit one copy without the others.
 *
 * `trim()` runs BEFORE `minLength(1)` (scrutiny #154 F6, deliberate behavior
 * change on all three endpoints): a whitespace-only value (" ") now fails with
 * the same "payment_slip is required" message instead of being stored verbatim
 * as a path, and a legit path arrives at the service with outer whitespace
 * stripped. The slip path is an opaque R2 token trusted from the upload
 * endpoint — the boundary only guards its shape, never its storage.
 */
export const PaymentSlipSchema = pipe(string(), trim(), minLength(1, "payment_slip is required"))
