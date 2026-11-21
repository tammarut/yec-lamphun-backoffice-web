import type { CreateMemberRequest } from "../create-new-member/create-member.types"

/**
 * The validated request DTO the PATCH route passes to UpdateMemberService.
 *
 * Structurally {@link CreateMemberRequest} with two divergences. `idCardNo` is
 * nullable: null (or an absent key, coalesced to null by the route) means "keep
 * the stored id card" — the null-sticky semantics of ADR-0012 extended to
 * id_card_no (README §8 item 9). GET /:id exposes only the Masked ID Card, so
 * an edit cannot echo the plaintext back; without stickiness every edit would
 * force re-typing the full 13-digit number.
 *
 * A non-null string still carries a NEW plaintext: it is validated (13 digits)
 * and re-encrypted by the domain, same as create.
 *
 * `paymentSlip` is nullable (#156): null (or an absent key, coalesced to null
 * by the route) means "keep the stored Registration Payment evidence" — no
 * ledger write, no payment-date re-stamp. A non-null string is the upload
 * endpoint's returned R2 token, stored verbatim by
 * {@link IMemberPaymentLedgerRepository.upsertRegistrationPayment} inside the
 * update transaction (attach-or-replace on the one-live-REGISTRATION index,
 * ADR-0033; fed by the edit wizard's การชำระเงิน step).
 */
export type UpdateMemberRequest = Omit<CreateMemberRequest, "idCardNo" | "paymentSlip"> & {
	readonly idCardNo: string | null
	readonly paymentSlip: string | null
}
