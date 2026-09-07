"use client"

import { useFormContext } from "react-hook-form"

import { FieldDescription, FieldError, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { RadioGroup, RadioGroupItem } from "src/shared/components/ui/radio-group"
import { REGISTRATION_TYPE_LABELS } from "src/modules/members/components/member-labels"
import { MemberWizardFileField } from "src/modules/members/components/member-wizard-file-field"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { cn } from "src/shared/lib/utils/utils"

/** Wizard step 1 — ข้อมูลการสมัคร: applicant type + the two เอกสารแนบ uploads. */
export function MemberWizardStepApplication({ disabled = false }: { disabled?: boolean }) {
	const { watch, setValue, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const registrationType = watch("registration_type")
	const isJuristic = registrationType === "JURISTIC_PERSON"
	const registrationError = formState.errors.registration_type

	return (
		<FieldSet data-slot="wizard-step-application" className="gap-8">
			<FieldSet>
				<FieldLegend variant="label">
					ประเภทการสมัคร <span className="text-destructive">*</span>
				</FieldLegend>
				<RadioGroup
					value={registrationType}
					disabled={disabled}
					onValueChange={(next) => {
						setValue("registration_type", next as MemberWizardFormValues["registration_type"], { shouldDirty: true })
						// Switching to นิติบุคคล re-arms the certificate requirement (cross-field rule).
						void trigger(["registration_type", "company_certificate"])
					}}
					className="grid gap-3 sm:grid-cols-2"
					aria-invalid={registrationError ? true : undefined}
				>
					{(["INDIVIDUAL", "JURISTIC_PERSON"] as const).map((type) => (
						<label
							key={type}
							data-slot="wizard-registration-type-card"
							className={cn(
								"flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
								registrationType === type ? "border-primary bg-primary/5" : "hover:border-primary/40"
							)}
						>
							<RadioGroupItem value={type} />
							<span className="font-medium">{REGISTRATION_TYPE_LABELS[type]}</span>
						</label>
					))}
				</RadioGroup>
				<FieldError errors={[registrationError]} />
				<FieldDescription>{isJuristic ? "นิติบุคคลต้องแนบหนังสือรับรองบริษัทในขั้นตอนถัดไป" : "บุคคลธรรมดาสมัครเป็นสมาชิกในนามบุคคล"}</FieldDescription>
			</FieldSet>

			<FieldSet>
				<FieldLegend variant="label">เอกสารแนบ</FieldLegend>
				<MemberWizardFileField
					name="company_certificate"
					label="หนังสือรับรองบริษัท/ทะเบียนพาณิชย์"
					helper={isJuristic ? "นิติบุคคลต้องแนบหนังสือรับรองบริษัท" : undefined}
					required={isJuristic}
					disabled={disabled}
				/>
				<MemberWizardFileField name="id_card_image" label="สำเนาบัตรประชาชน" disabled={disabled} />
			</FieldSet>
		</FieldSet>
	)
}
