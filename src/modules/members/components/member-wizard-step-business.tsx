"use client"

import { Controller, useFormContext } from "react-hook-form"

import { Alert, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { Input } from "src/shared/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/shared/components/ui/select"
import { Textarea } from "src/shared/components/ui/textarea"
import { MemberWizardFileField } from "src/modules/members/components/member-wizard-file-field"
import { useBusinessCategories } from "src/modules/members/hooks/use-business-categories"
import { DB_MAX_LENGTHS, type MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

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

/** Wizard step 3 — ข้อมูลธุรกิจ: business identity, live-fed category, location, uploads. */
export function MemberWizardStepBusiness({ disabled = false }: { disabled?: boolean }) {
	const { control, register, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const categoriesQuery = useBusinessCategories()
	const categoryError = formState.errors.business?.category_id

	return (
		<FieldSet data-slot="wizard-step-business" className="gap-8">
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
								<Select
									value={field.value}
									disabled={disabled || categoriesQuery.isPending}
									onValueChange={(next) => {
										field.onChange(next)
										void trigger("business.category_id")
									}}
								>
									<SelectTrigger id="wizard-business-category_id" aria-invalid={categoryError ? true : undefined} className="w-full">
										<SelectValue placeholder={categoriesQuery.isPending ? "กำลังโหลดหมวดธุรกิจ..." : "-- เลือกหมวดธุรกิจ --"} />
									</SelectTrigger>
									<SelectContent>
										{(categoriesQuery.data ?? []).map((category) => (
											<SelectItem key={category.id} value={String(category.id)}>
												{category.category_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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

			<FieldSet>
				<FieldLegend variant="label">รูปภาพกิจการ</FieldLegend>
				<div className="grid gap-4 sm:grid-cols-2">
					<MemberWizardFileField name="business.logo" label="แนบรูปโลโก้ (Logo)" disabled={disabled} />
					<MemberWizardFileField name="business.product" label="แนบรูปผลิตภัณฑ์ (Product)" disabled={disabled} />
				</div>
			</FieldSet>
		</FieldSet>
	)
}
