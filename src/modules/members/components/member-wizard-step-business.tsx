"use client"

import { Controller, useFormContext, type FieldPath } from "react-hook-form"

import { Alert, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { Input } from "src/shared/components/ui/input"
import { RadioGroup, RadioGroupItem } from "src/shared/components/ui/radio-group"
import { Textarea } from "src/shared/components/ui/textarea"
import { BusinessPickerCombobox } from "src/modules/members/components/business-picker-combobox"
import { MemberComboboxSelect } from "src/modules/members/components/member-combobox-select"
import { useMemberWizardEdit } from "src/modules/members/components/member-wizard-edit-context"
import { MemberWizardFileField } from "src/modules/members/components/member-wizard-file-field"
import { SelectedBusinessCard } from "src/modules/members/components/selected-business-card"
import { useBusinessCategories } from "src/modules/members/hooks/use-business-categories"
import { DB_MAX_LENGTHS, STEP_FIELDS, type MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { cn } from "src/shared/lib/utils/utils"

/** The ตัวเลือกกิจการ radio-card pair, in the step-1 ประเภทการสมัคร idiom (proto/business-picker variant B). */
const BUSINESS_MODE_CARDS = [
	{ value: "create", label: "สร้างกิจการใหม่", description: "กรอกข้อมูลกิจการเองทั้งหมด" },
	{ value: "link", label: "ผูกกิจการที่มีอยู่แล้ว", description: "ค้นหากิจการเดิมเพื่อไม่สร้างข้อมูลซ้ำ" },
] as const

function BusinessTextField({
	name,
	label,
	required = false,
	placeholder,
	type = "text",
	maxLength,
	disabled,
}: {
	name: "business.name" | "business.juristic_registration_no" | "business.latitude" | "business.longitude" | "business.core_business" | "business.website"
	label: string
	required?: boolean
	placeholder?: string
	type?: string
	maxLength?: number
	disabled?: boolean
}) {
	const { register, formState } = useFormContext<MemberWizardFormValues>()
	const error = formState.errors.business?.[name.split(".")[1] as keyof MemberWizardFormValues["business"]]
	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={`wizard-${name}`}>
				{label}
				{required && <span className="text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={`wizard-${name}`}
				type={type}
				placeholder={placeholder}
				maxLength={maxLength}
				disabled={disabled}
				aria-invalid={error ? true : undefined}
				{...register(name)}
			/>
			<FieldError errors={[error]} />
		</Field>
	)
}

/** The manual create-path fields — identical to pre-#70 step 3 (zero regression). */
function ManualBusinessFields({ disabled }: { disabled?: boolean }) {
	const { control, register, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const categoriesQuery = useBusinessCategories()
	const categoryError = formState.errors.business?.category_id

	return (
		<FieldSet>
			<FieldLegend variant="label">ข้อมูลกิจการ/ร้านค้า</FieldLegend>
			<BusinessTextField
				name="business.name"
				label="ชื่อกิจการ/ร้านค้า"
				required
				placeholder="ชื่อกิจการ/ร้านค้า"
				maxLength={DB_MAX_LENGTHS.businessName}
				disabled={disabled}
			/>
			<div className="grid gap-4 sm:grid-cols-2">
				<BusinessTextField name="business.juristic_registration_no" label="เลขทะเบียนนิติบุคคล" required placeholder="เลขทะเบียนนิติบุคคล" disabled={disabled} />
				<Field data-invalid={categoryError ? true : undefined}>
					<FieldLabel htmlFor="wizard-business-category_id">
						หมวดธุรกิจหลัก<span className="text-destructive">*</span>
					</FieldLabel>
					<Controller
						control={control}
						name="business.category_id"
						render={({ field }) => (
							<MemberComboboxSelect
								id="wizard-business-category_id"
								options={(categoriesQuery.data ?? []).map((category) => ({ value: String(category.id), label: category.category_name }))}
								value={field.value}
								onValueChange={(next) => {
									field.onChange(next)
									void trigger("business.category_id")
								}}
								placeholder={categoriesQuery.isPending ? "กำลังโหลดหมวดธุรกิจ..." : "-- เลือกหมวดธุรกิจ --"}
								disabled={disabled || categoriesQuery.isPending}
								invalid={categoryError ? true : false}
							/>
						)}
					/>
					<FieldError errors={[categoryError]} />
				</Field>
			</div>
			<Field data-invalid={formState.errors.business?.address ? true : undefined}>
				<FieldLabel htmlFor="wizard-business-address">ที่อยู่กิจการ</FieldLabel>
				<Textarea
					id="wizard-business-address"
					className="min-h-20"
					placeholder="ที่อยู่กิจการ"
					disabled={disabled}
					aria-invalid={formState.errors.business?.address ? true : undefined}
					{...register("business.address")}
				/>
				<FieldError errors={[formState.errors.business?.address]} />
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<BusinessTextField name="business.latitude" label="Latitude" placeholder="18.5753" disabled={disabled} />
				<BusinessTextField name="business.longitude" label="Longitude" placeholder="99.0094" disabled={disabled} />
			</div>
			<Field data-invalid={formState.errors.business?.description ? true : undefined}>
				<FieldLabel htmlFor="wizard-business-description">
					รายละเอียดกิจการสั้นๆ<span className="text-destructive">*</span>
				</FieldLabel>
				<Textarea
					id="wizard-business-description"
					className="min-h-20"
					placeholder="แนะนำธุรกิจของท่าน..."
					disabled={disabled}
					aria-invalid={formState.errors.business?.description ? true : undefined}
					{...register("business.description")}
				/>
				<FieldError errors={[formState.errors.business?.description]} />
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<BusinessTextField name="business.core_business" label="ผลิตภัณฑ์หรือบริการหลัก" placeholder="ผลิตภัณฑ์หรือบริการหลัก" disabled={disabled} />
				<BusinessTextField name="business.website" label="Website (ถ้ามี)" placeholder="www.example.com" disabled={disabled} />
			</div>
			{categoriesQuery.isError && (
				<Alert variant="destructive" data-slot="wizard-categories-error">
					<AlertTitle>โหลดหมวดธุรกิจไม่สำเร็จ</AlertTitle>
					<div className="mt-2">
						<Button type="button" variant="outline" size="sm" onClick={() => categoriesQuery.refetch()}>
							ลองใหม่
						</Button>
					</div>
				</Alert>
			)}
		</FieldSet>
	)
}

/**
 * Wizard step 3 — ข้อมูลธุรกิจ (#70): a ตัวเลือกกิจการ radio pair picks between
 * the manual form (สร้างกิจการใหม่, the default — zero regression) and the
 * server-search picker (ผูกกิจการที่มีอยู่แล้ว), which swaps the combobox for
 * a read-only lock card once a business is picked. Switching the radio clears
 * any selection. Edit mode keeps the manual form only — re-linking is #71.
 */
export function MemberWizardStepBusiness({ disabled = false }: { disabled?: boolean }) {
	const { trigger, setValue, watch, formState } = useFormContext<MemberWizardFormValues>()
	const edit = useMemberWizardEdit()
	const editMode = edit !== null
	const businessMode = watch("business.mode")
	const linkedBusiness = watch("business.linked_business")
	const linkedBusinessError = formState.errors.business?.linked_business

	function switchBusinessMode(next: MemberWizardFormValues["business"]["mode"]) {
		// Switching the radio clears any selection — both directions (#70) —
		// and revalidates the whole step so errors from the OTHER branch
		// (e.g. manual required fields after a failed ถัดไป) don't linger.
		setValue("business.mode", next, { shouldDirty: true })
		setValue("business.linked_business", null, { shouldDirty: true })
		void trigger([...STEP_FIELDS[3]] as FieldPath<MemberWizardFormValues>[])
	}

	return (
		<FieldSet data-slot="wizard-step-business" className="gap-8">
			<FieldSet>
				{!editMode && (
					<>
						<FieldLegend variant="label">
							ตัวเลือกกิจการ<span className="text-destructive">*</span>
						</FieldLegend>
						<RadioGroup
							value={businessMode}
							disabled={disabled}
							onValueChange={(next) => switchBusinessMode(next as MemberWizardFormValues["business"]["mode"])}
							className="mb-4 grid gap-3 sm:grid-cols-2"
						>
							{BUSINESS_MODE_CARDS.map((card) => (
								<label
									key={card.value}
									data-slot="wizard-business-mode-card"
									className={cn(
										"flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
										businessMode === card.value ? "border-primary bg-primary/5" : "hover:border-primary/40"
									)}
								>
									<RadioGroupItem value={card.value} className="mt-0.5" />
									<span className="min-w-0">
										<span className="block font-medium">{card.label}</span>
										<span className="text-muted-foreground block text-xs">{card.description}</span>
									</span>
								</label>
							))}
						</RadioGroup>
					</>
				)}
				{businessMode === "link" ? (
					<div className="grid gap-2">
						{linkedBusiness === null ? (
							<BusinessPickerCombobox
								disabled={disabled}
								onSelect={(business) => {
									setValue("business.linked_business", business, { shouldDirty: true })
									void trigger("business.linked_business")
								}}
							/>
						) : (
							<SelectedBusinessCard
								business={linkedBusiness}
								// No trigger here: the user is mid-pick; ถัดไป revalidates.
								onClear={() => setValue("business.linked_business", null, { shouldDirty: true })}
							/>
						)}
						<FieldError errors={[linkedBusinessError]} />
					</div>
				) : (
					<ManualBusinessFields disabled={disabled} />
				)}
			</FieldSet>

			{businessMode === "create" && (
				<FieldSet>
					<FieldLegend variant="label">รูปภาพกิจการ</FieldLegend>
					<div className="grid gap-4 sm:grid-cols-2">
						<MemberWizardFileField name="business.logo" label="แนบรูปโลโก้ (Logo)" disabled={disabled} />
						<MemberWizardFileField name="business.product" label="แนบรูปผลิตภัณฑ์ (Product)" disabled={disabled} />
					</div>
				</FieldSet>
			)}
		</FieldSet>
	)
}
