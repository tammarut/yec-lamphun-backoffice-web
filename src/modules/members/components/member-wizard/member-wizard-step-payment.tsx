"use client"

import { FieldDescription, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { MemberExistingFileThumb, MemberWizardFileField } from "src/modules/members/components/member-wizard/member-wizard-file-field"
import { useMemberWizardEdit } from "src/modules/members/components/member-wizard/member-wizard-edit-context"
import { fileLabelFromUrl } from "src/modules/members/schemas/member-wizard-mapping"

/**
 * Wizard step ④ — การชำระเงิน (#155): the Registration Payment slip.
 *
 * Create mode stages the required slip through the shared file field — the
 * instant 7MB/extension checks and the image preview come with it. Edit mode
 * is a READ-ONLY prefill of the stored slip (live presigned URL from the edit
 * context, expiry-retry included): PATCH carries no payment_slip key until
 * #156, so attach/replace controls here would upload a file the PATCH then
 * silently drops.
 */
export function MemberWizardStepPayment({ disabled = false }: { disabled?: boolean }) {
	const edit = useMemberWizardEdit()
	const slipUrl = edit?.existingUrls.payment_slip ?? null
	return (
		<FieldSet data-slot="wizard-step-payment" className="gap-4">
			<FieldSet>
				<FieldLegend variant="label">
					หลักฐานการชำระเงิน
					{edit === null && <span className="text-destructive"> *</span>}
				</FieldLegend>
				{edit !== null ? (
					slipUrl !== null ? (
						<>
							<div data-slot="member-file-selected" className="border-border flex w-full items-center gap-4 rounded-xl border p-3">
								<MemberExistingFileThumb
									url={slipUrl}
									field="payment_slip"
									onError={edit.onExistingImageError}
									className="border-border size-24 rounded-lg border"
								/>
								<span className="text-foreground truncate text-sm font-medium" title={fileLabelFromUrl(slipUrl)}>
									{fileLabelFromUrl(slipUrl)}
								</span>
							</div>
							<FieldDescription>หลักฐานการชำระเงินที่เก็บไว้ในระบบ (แสดงเท่านั้น)</FieldDescription>
						</>
					) : (
						<>
							<p className="text-muted-foreground text-sm italic">ไม่ได้แนบ</p>
							<FieldDescription>สมาชิกนี้ยังไม่มีหลักฐานการชำระเงินที่เก็บไว้ในระบบ</FieldDescription>
						</>
					)
				) : (
					<>
						<FieldDescription>แนบสลิปหรือหลักฐานการโอนเงินค่าลงทะเบียนสมาชิก</FieldDescription>
						<MemberWizardFileField name="payment_slip" label="หลักฐานการชำระเงิน" required disabled={disabled} />
					</>
				)}
			</FieldSet>
		</FieldSet>
	)
}
