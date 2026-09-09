"use client"

import { Camera01Icon, Cancel01Icon, Image01Icon, Upload04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"

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

/**
 * A picked-file preview thumbnail: derives its own CSP-safe `data:` URL from
 * the staged File (blob: is not allowed by the CSP and no CSP change is in
 * scope). The URL never enters form state, so drafts stay small and the wire
 * payload stays untouched; re-derives on remount (stepping away and back).
 */
export function MemberFileThumb({ file, className }: { file: File | null; className?: string }) {
	const [url, setUrl] = useState<string | null>(null)
	useEffect(() => {
		if (file === null) {
			return
		}
		const reader = new FileReader()
		reader.onload = () => {
			setUrl(typeof reader.result === "string" ? reader.result : null)
		}
		reader.readAsDataURL(file)
	}, [file])
	if (url !== null && file !== null) {
		// Plain <img>, not the Avatar primitive: this is a local FileReader
		// data: URL (not a remote member avatar), and Avatar defers rendering
		// until a browser image-load event that never fires in jsdom.
		return (
			// eslint-disable-next-line @next/next/no-img-element -- local data: URL preview, next/image adds nothing
			<img src={url} alt="" data-slot="member-file-thumb" className={cn("object-cover", className)} />
		)
	}
	return (
		<span data-slot="member-file-thumb-fallback" className={cn("bg-muted text-muted-foreground flex items-center justify-center", className)}>
			<HugeiconsIcon icon={Image01Icon} className="size-1/2" />
		</span>
	)
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
 * checks mirroring member-file.constants.ts, and a selected-state preview
 * card (thumbnail + เปลี่ยนไฟล์ / ลบไฟล์) once a file is staged. The actual
 * upload happens at submit (uploads-first, one multipart POST) — this
 * component only stages the File in form state.
 */
export function MemberWizardFileField({ name, label, helper, required = false, variant = "document", disabled = false }: MemberWizardFileFieldProps) {
	const inputId = useId()
	const inputRef = useRef<HTMLInputElement>(null)
	const { setError, setValue, trigger, formState } = useFormContext<MemberWizardFormValues>()
	const error = formState.errors[name as keyof MemberWizardFormValues]
	const fileValue = useWatch({ name })
	const fileName = fileValue?.file?.name ?? null

	function handleFileChange(file: File | undefined) {
		if (!file) {
			return
		}
		const invalidReason = validateMemberFile(file)
		setValue(name, { file: invalidReason === null ? file : null, existingUrl: null }, { shouldDirty: true })
		if (invalidReason !== null) {
			setError(name, { type: "validate", message: invalidReason })
		} else {
			void trigger(name)
		}
	}

	function handleRemove() {
		setValue(name, { file: null, existingUrl: null }, { shouldDirty: true })
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
						<MemberFileThumb file={fileValue?.file ?? null} className="size-full" />
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
			) : fileName === null ? (
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
					<span className="text-sm">คลิกเพื่อแนบไฟล์รูปภาพ · ขนาดไม่เกิน 7MB ({ALLOWED_EXTENSIONS.join(", ")})</span>
				</button>
			) : (
				<div data-slot="member-file-selected" className={cn("flex w-full items-center gap-4 rounded-xl border p-3", error ? "border-destructive" : "border-border")}>
					<MemberFileThumb file={fileValue?.file ?? null} className="border-border size-24 rounded-lg border" />
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<span className="text-foreground truncate text-sm font-medium" title={fileName}>
							{fileName}
						</span>
						<div className="flex flex-wrap gap-2">
							<Button type="button" variant="outline" size="sm" disabled={disabled} onClick={pick}>
								<HugeiconsIcon icon={Upload04Icon} className="size-4" />
								เปลี่ยนไฟล์
							</Button>
							<Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={handleRemove}>
								<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
								ลบไฟล์
							</Button>
						</div>
					</div>
				</div>
			)}
			<FieldError errors={[error]} />
		</Field>
	)
}
