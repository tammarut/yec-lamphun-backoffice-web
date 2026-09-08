"use client"

import { LockKeyIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Controller, useFormContext } from "react-hook-form"

import { Badge } from "src/shared/components/ui/badge"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "src/shared/components/ui/field"
import { Input } from "src/shared/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/shared/components/ui/select"
import { GENDER_LABELS, POSITION_LABELS, SHIRT_SIZE_LABELS, SINGLE_CARDINALITY_POSITIONS } from "src/modules/members/components/member-labels"
import { MemberWizardFileField } from "src/modules/members/components/member-wizard-file-field"
import { computeAgeLabel, formatIdCardNo } from "src/modules/members/schemas/member-wizard-mapping"
import { DB_MAX_LENGTHS, GENDERS, POSITIONS, SHIRT_SIZES, TITLES_EN, TITLES_TH, type MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

function TextField({
	name,
	label,
	required = false,
	placeholder,
	type = "text",
	inputMode,
	maxLength,
	disabled,
}: {
	name: "first_name_th" | "last_name_th" | "nickname" | "first_name_en" | "last_name_en" | "nationality" | "id_card_no" | "phone_no" | "email" | "line_id"
	label: string
	required?: boolean
	placeholder?: string
	type?: string
	inputMode?: "text" | "numeric" | "tel" | "email"
	maxLength?: number
	disabled?: boolean
}) {
	const { register, formState } = useFormContext<MemberWizardFormValues>()
	const error = formState.errors[name]
	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={`wizard-${name}`}>
				{label}
				{required && <span className="text-destructive">*</span>}
			</FieldLabel>
			<Input
				id={`wizard-${name}`}
				type={type}
				inputMode={inputMode}
				maxLength={maxLength}
				placeholder={placeholder}
				disabled={disabled}
				aria-invalid={error ? true : undefined}
				{...register(name)}
			/>
			<FieldError errors={[error]} />
		</Field>
	)
}

function SelectField({
	name,
	label,
	values,
	labelOf,
	required = false,
	placeholder,
	helper,
	disabled,
}: {
	name: "title_name_th" | "title_name_en" | "gender" | "shirt_size" | "position"
	label: string
	values: readonly string[]
	labelOf: (value: string) => string
	required?: boolean
	placeholder?: string
	helper?: React.ReactNode
	disabled?: boolean
}) {
	const { control, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const error = formState.errors[name]
	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={`wizard-${name}`}>
				{label}
				{required && <span className="text-destructive">*</span>}
			</FieldLabel>
			<Controller
				control={control}
				name={name}
				render={({ field }) => (
					<Select
						value={field.value}
						disabled={disabled}
						onValueChange={(next) => {
							field.onChange(next)
							void trigger(name)
						}}
					>
						<SelectTrigger id={`wizard-${name}`} aria-invalid={error ? true : undefined} className="w-full">
							<SelectValue placeholder={placeholder ?? "-- กรุณาเลือก --"} />
						</SelectTrigger>
						<SelectContent>
							{values.map((value) => (
								<SelectItem key={value} value={value}>
									{labelOf(value)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			/>
			<FieldError errors={[error]} />
			{helper && !error && <FieldDescription>{helper}</FieldDescription>}
		</Field>
	)
}

/** Wizard step 2 — ข้อมูลส่วนตัว: profile, TH/EN names, id card, contacts, shirt/position. */
export function MemberWizardStepPersonal({ disabled = false }: { disabled?: boolean }) {
	const { control, register, watch, formState } = useFormContext<MemberWizardFormValues>()
	const ageLabel = computeAgeLabel(watch("date_of_birth"))
	const position = watch("position")
	const restrictedPosition = SINGLE_CARDINALITY_POSITIONS.has(position)

	return (
		<FieldSet data-slot="wizard-step-personal" className="gap-8">
			<FieldSet>
				<FieldLegend variant="label">ข้อมูลส่วนบุคคล</FieldLegend>
				<MemberWizardFileField name="profile_avatar" label="รูปโปรไฟล์" helper="แนะนำขนาด 1:1" variant="avatar" disabled={disabled} />
				<div className="grid gap-4 sm:grid-cols-3">
					<SelectField name="title_name_th" label="คำนำหน้า (TH)" required values={TITLES_TH} labelOf={(v) => v} disabled={disabled} />
					<TextField name="first_name_th" label="ชื่อ (TH)" required placeholder="ชื่อจริง" maxLength={DB_MAX_LENGTHS.firstNameTh} disabled={disabled} />
					<TextField name="last_name_th" label="นามสกุล (TH)" required placeholder="นามสกุล" maxLength={DB_MAX_LENGTHS.lastNameTh} disabled={disabled} />
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<TextField name="nickname" label="ชื่อเล่น" required placeholder="ชื่อเล่น" maxLength={DB_MAX_LENGTHS.nickname} disabled={disabled} />
				</div>
				<div className="bg-muted/40 rounded-xl p-4">
					<FieldDescription>ชื่อภาษาอังกฤษ (กรอกเพิ่มเติม ไม่บังคับ)</FieldDescription>
					<div className="mt-3 grid gap-4 sm:grid-cols-3">
						<SelectField name="title_name_en" label="Prefix (EN)" values={TITLES_EN} labelOf={(v) => v} placeholder="-- ไม่ระบุ --" disabled={disabled} />
						<TextField name="first_name_en" label="First Name" placeholder="First name" maxLength={DB_MAX_LENGTHS.firstNameEn} disabled={disabled} />
						<TextField name="last_name_en" label="Last Name" placeholder="Last name" maxLength={DB_MAX_LENGTHS.lastNameEn} disabled={disabled} />
					</div>
				</div>
			</FieldSet>

			<FieldSet>
				<div className="grid gap-4 sm:grid-cols-4">
					<SelectField name="gender" label="เพศ" values={GENDERS} labelOf={(v) => GENDER_LABELS[v] ?? v} disabled={disabled} />
					<Field data-invalid={formState.errors.date_of_birth ? true : undefined}>
						<FieldLabel htmlFor="wizard-date_of_birth">
							วันเดือนปีเกิด<span className="text-destructive">*</span>
						</FieldLabel>
						<Input
							id="wizard-date_of_birth"
							type="date"
							disabled={disabled}
							aria-invalid={formState.errors.date_of_birth ? true : undefined}
							{...register("date_of_birth")}
						/>
						<FieldError errors={[formState.errors.date_of_birth]} />
					</Field>
					<Field>
						<FieldLabel htmlFor="wizard-age">อายุ</FieldLabel>
						<Input id="wizard-age" readOnly disabled value={ageLabel} placeholder="-" />
					</Field>
					<TextField name="nationality" label="สัญชาติ" required placeholder="สัญชาติ" maxLength={DB_MAX_LENGTHS.nationality} disabled={disabled} />
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field data-invalid={formState.errors.id_card_no ? true : undefined}>
						<FieldLabel htmlFor="wizard-id_card_no">เลขบัตรประชาชน (13 หลัก)</FieldLabel>
						<Controller
							control={control}
							name="id_card_no"
							render={({ field }) => (
								<Input
									id="wizard-id_card_no"
									inputMode="numeric"
									maxLength={17}
									placeholder="x-xxxx-xxxxx-xx-x"
									disabled={disabled}
									aria-invalid={formState.errors.id_card_no ? true : undefined}
									value={formatIdCardNo(field.value)}
									ref={field.ref}
									onBlur={field.onBlur}
									onChange={(event) => {
										// Digits-only under the display mask (setValueAs is ignored under resolver mode).
										field.onChange(event.target.value.replace(/\D/g, "").slice(0, 13))
									}}
								/>
							)}
						/>
						<FieldError errors={[formState.errors.id_card_no]} />
					</Field>
					<Field data-invalid={formState.errors.id_card_expiry_date ? true : undefined}>
						<FieldLabel htmlFor="wizard-id_card_expiry_date">
							วันหมดอายุบัตร<span className="text-destructive">*</span>
						</FieldLabel>
						<Input
							id="wizard-id_card_expiry_date"
							type="date"
							disabled={disabled}
							aria-invalid={formState.errors.id_card_expiry_date ? true : undefined}
							{...register("id_card_expiry_date")}
						/>
						<FieldError errors={[formState.errors.id_card_expiry_date]} />
					</Field>
				</div>
			</FieldSet>

			<FieldSet>
				<FieldLegend variant="label">การต่ออายุสมาชิก</FieldLegend>
				<div className="bg-muted/40 grid gap-4 rounded-xl p-4 sm:grid-cols-3">
					<Field>
						<FieldLabel htmlFor="wizard-renewal-since">เป็นสมาชิกตั้งแต่</FieldLabel>
						<Input id="wizard-renewal-since" disabled placeholder="ระบบจะระบุอัตโนมัติ" />
					</Field>
					<Field>
						<FieldLabel htmlFor="wizard-renewal-duration">ระยะเวลาการเป็นสมาชิก</FieldLabel>
						<Input id="wizard-renewal-duration" disabled placeholder="ระบบจะคำนวณอัตโนมัติ" />
					</Field>
					<Field>
						<FieldLabel htmlFor="wizard-renewal-status">สถานะสมาชิก</FieldLabel>
						<div className="flex h-9 items-center">
							<Badge id="wizard-renewal-status" variant="outline" className="text-muted-foreground bg-muted border-transparent">
								ระบบจะระบุอัตโนมัติ
							</Badge>
						</div>
					</Field>
					<FieldDescription className="sm:col-span-3">
						<span className="inline-flex items-center gap-1.5">
							<HugeiconsIcon icon={LockKeyIcon} className="size-4" />
							ข้อมูลการต่ออายุและสถานะสมาชิกจะถูกจัดการผ่านระบบการต่ออายุโดยอัตโนมัติ
						</span>
					</FieldDescription>
				</div>
			</FieldSet>

			<FieldSet>
				<FieldLegend variant="label">ข้อมูลติดต่อ &amp; อื่นๆ</FieldLegend>
				<div className="grid gap-4 sm:grid-cols-3">
					<TextField
						name="phone_no"
						label="เบอร์โทรศัพท์"
						required
						placeholder="xxx-xxx-xxxx"
						type="tel"
						inputMode="tel"
						maxLength={DB_MAX_LENGTHS.phoneNo}
						disabled={disabled}
					/>
					<TextField name="email" label="อีเมล" placeholder="name@example.com" type="email" inputMode="email" maxLength={DB_MAX_LENGTHS.email} disabled={disabled} />
					<TextField name="line_id" label="Line ID" placeholder="Line ID" maxLength={DB_MAX_LENGTHS.lineId} disabled={disabled} />
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<SelectField
						name="shirt_size"
						label="ไซส์เสื้อ (Shirt Size)"
						values={SHIRT_SIZES}
						labelOf={(v) => SHIRT_SIZE_LABELS[v] ?? v}
						placeholder="-- ไม่ระบุ --"
						disabled={disabled}
					/>
					<SelectField
						name="position"
						label="ตำแหน่งใน YEC Lamphun"
						required
						values={POSITIONS}
						labelOf={(v) => POSITION_LABELS[v] ?? v}
						disabled={disabled}
						helper={restrictedPosition ? "ตำแหน่งนี้มีผู้ดำรงตำแหน่งได้เพียงหนึ่งคน — หากมีผู้ดำรงอยู่ ระบบจะแจ้งเมื่อบันทึกข้อมูล" : undefined}
					/>
				</div>
			</FieldSet>
		</FieldSet>
	)
}
