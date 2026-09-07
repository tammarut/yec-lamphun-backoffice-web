"use client"

import { Camera01Icon, Cancel01Icon, Image01Icon, Upload04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "src/shared/components/ui/field"
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "src/modules/members/member-file.constants"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { cn } from "src/shared/lib/utils/utils"

/** Instant client mirror of the upload route's checks (member-file.constants.ts). */
export function validateMemberFile(file: File): string | null {
	const extension = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`
	if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
		return `รองรับเฉพาะไฟล์รูปภาพ (${ALLOWED_EXTENSIONS.join(", ")})`
	}
	if (file.size > MAX_FILE_SIZE_BYTES) {
		return "ขนาดไฟล์ต้องไม่เกิน 7MB"
	}
	return null
}

type MemberWizardFileFieldProps = {
	/** RHF field path of the `{ file, existingUrl }` pair. */
	name: "company_certificate" | "id_card_image" | "profile_avatar" | "business.logo" | "business.product"
	label: string
	helper?: string
	required?: boolean
	/** Round avatar presentation instead of the dashed document box. */
	variant?: "document" | "avatar"
	disabled?: boolean
}

/**
 * One Member File Field of the wizard: a hidden file input behind a dashed
 * upload box (or a round camera-overlay avatar), instant size/extension
 * checks mirroring member-file.constants.ts, and a CSP-safe `data:` URL
 * preview (blob: is not allowed by the CSP and no CSP change is in scope).
 * The actual upload happens at submit (uploads-first, one multipart POST) —
 * this component only stages the File in form state.
 */
export function MemberWizardFileField({ name, label, helper, required = false, variant = "document", disabled = false }: MemberWizardFileFieldProps) {
	const inputId = useId()
	const inputRef = useRef<HTMLInputElement>(null)
	const { setError, setValue, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const error = formState.errors[name as keyof MemberWizardFormValues]
	const fileValue = useWatch({ name })
	const fileName = fileValue?.file?.name ?? null
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)

	function handleFileChange(file: File | undefined) {
		if (!file) {
			return
		}
		const invalidReason = validateMemberFile(file)
		setValue(name, { file: invalidReason === null ? file : null, existingUrl: null }, { shouldDirty: true })
		if (invalidReason !== null) {
			setPreviewUrl(null)
			setError(name, { type: "validate", message: invalidReason })
			return
		}
		const reader = new FileReader()
		reader.onload = () => {
			setPreviewUrl(typeof reader.result === "string" ? reader.result : null)
		}
		reader.readAsDataURL(file)
		void trigger(name)
	}

	function handleRemove() {
		setValue(name, { file: null, existingUrl: null }, { shouldDirty: true })
		setPreviewUrl(null)
		void trigger(name)
	}

	const pick = () => inputRef.current?.click()

	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="text-destructive">*</span>}
			</FieldLabel>
			{helper && <FieldDescription>{helper}</FieldDescription>}
			<input
				ref={inputRef}
				id={inputId}
				type="file"
				accept={ALLOWED_EXTENSIONS.join(",")}
				className="sr-only"
				disabled={disabled}
				aria-invalid={error ? true : undefined}
				onChange={(event) => {
					handleFileChange(event.target.files?.[0])
					// Allow re-picking the same file after a remove.
					event.target.value = ""
				}}
			/>
			{variant === "avatar" ? (
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={pick}
						disabled={disabled}
						data-slot="member-file-avatar"
						aria-label={`${label} — เลือกไฟล์`}
						className={cn(
							"bg-muted relative flex size-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed",
							error ? "border-destructive" : "border-border",
							"hover:border-primary/50"
						)}
					>
						<Avatar className="size-full">
							{previewUrl !== null && <AvatarImage src={previewUrl} alt="" />}
							<AvatarFallback className="bg-transparent">
								<HugeiconsIcon icon={Image01Icon} className="text-muted-foreground size-8" />
							</AvatarFallback>
						</Avatar>
						<span className="bg-primary/90 text-primary-foreground absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-full">
							<HugeiconsIcon icon={Camera01Icon} className="size-4" />
						</span>
					</button>
					<div className="flex flex-col items-start gap-1">
						<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={pick}>
							<HugeiconsIcon icon={Upload04Icon} className="size-4" />
							เลือกรูปโปรไฟล์
						</Button>
						{fileName !== null && (
							<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={handleRemove}>
								<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
								ลบรูป
							</Button>
						)}
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={pick}
					disabled={disabled}
					data-slot="member-file-box"
					className={cn(
						"border-muted text-muted-foreground hover:border-primary/50 hover:text-foreground flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
						error ? "border-destructive text-destructive hover:border-destructive" : ""
					)}
				>
					<HugeiconsIcon icon={Upload04Icon} className="size-7" />
					{fileName !== null ? (
						<span className="text-foreground text-sm">{fileName}</span>
					) : (
						<span className="text-sm">คลิกเพื่อแนบไฟล์รูปภาพ · ขนาดไม่เกิน 7MB ({ALLOWED_EXTENSIONS.join(", ")})</span>
					)}
				</button>
			)}
			<FieldError errors={[error]} />
		</Field>
	)
}
