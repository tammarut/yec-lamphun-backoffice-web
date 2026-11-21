"use client"

import { FieldDescription, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { MemberWizardFileField } from "src/modules/members/components/member-wizard/member-wizard-file-field"
import { useMemberWizardEdit } from "src/modules/members/components/member-wizard/member-wizard-edit-context"

/**
 * Wizard step ④ — การชำระเงิน (#155): the Registration Payment slip.
 *
 * Both modes render the shared file field. Create requires a staged slip
 * (POST rejects without it since #154). Edit (#156) is the attach-or-replace
 * surface: the stored slip previews from its live presigned URL (expiry-retry
 * included) and a newly staged file uploads at submit, riding PATCH's
 * payment_slip key into the ledger upsert that re-stamps the payment date;
 * leaving it untouched submits null — the sticky keep of the stored evidence.
 * PATCH cannot clear a slip (null = keep), so the field is replace-only while
 * the stored slip shows (no ลบไฟล์, matching every other Member File field).
 */
export function MemberWizardStepPayment({ disabled = false }: { disabled?: boolean }) {
	const edit = useMemberWizardEdit()
	return (
		<FieldSet data-slot="wizard-step-payment" className="gap-4">
			{/* Section title distinct from the field label below (scrutiny F1 — the label repeats หลักฐานการชำระเงิน). */}
			<FieldLegend variant="label">การชำระเงิน</FieldLegend>
			<FieldDescription>แนบสลิปหรือหลักฐานการโอนเงินค่าลงทะเบียนสมาชิก</FieldDescription>
			<MemberWizardFileField name="payment_slip" label="หลักฐานการชำระเงิน" required={edit === null} disabled={disabled} />
		</FieldSet>
	)
}
