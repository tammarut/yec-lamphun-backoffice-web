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
 */
export type UpdateMemberRequest = Omit<CreateMemberRequest, "idCardNo"> & {
	readonly idCardNo: string | null
}
