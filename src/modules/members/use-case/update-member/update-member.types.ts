import type { CreateMemberRequest } from "../create-new-member/create-member.types"

/**
 * The validated request DTO the PATCH route passes to UpdateMemberService.
 *
 * Structurally {@link CreateMemberRequest} with one divergence: `idCardNo` is
 * nullable. Null (or an absent key, coalesced to null by the route) means "keep
 * the stored id card" — the null-sticky semantics of ADR-0012 extended to
 * id_card_no (README §8 item 9). GET /:id exposes only the Masked ID Card, so
 * an edit cannot echo the plaintext back; without stickiness every edit would
 * force re-typing the full 13-digit number.
 *
 * A non-null string still carries a NEW plaintext: it is validated (13 digits)
 * and re-encrypted by the domain, same as create.
 *
 * `paymentSlip` is ALSO omitted (#154): the create flow's required slip has no
 * PATCH counterpart yet — the edit flow's attach-or-replace ledger write is
 * #156's scope, which restores the field (fed by the edit wizard's optional
 * การชำระเงิน step) and wires {@link IMemberRepository.upsertRegistrationPayment}.
 */
export type UpdateMemberRequest = Omit<CreateMemberRequest, "idCardNo" | "paymentSlip"> & {
	readonly idCardNo: string | null
}
