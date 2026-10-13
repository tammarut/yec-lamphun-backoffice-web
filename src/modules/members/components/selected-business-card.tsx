"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Building01Icon, Cancel01Icon, CheckmarkCircle01Icon, LockedIcon, UserMultiple03Icon } from "@hugeicons/core-free-icons"

import type { BusinessPickerItem } from "src/modules/members/schemas/member-wizard-schema"

type SelectedBusinessCardProps = {
	business: BusinessPickerItem
	onClear: () => void
	/** Edit mode (#71): the member moves to this business instead of a new member joining it. */
	editMode?: boolean
}

/**
 * The read-only lock card for a picked business (#70): a linked business is
 * never edited here — its fields stay locked, the co-member count and owner
 * names are shown before saving, and submit sends `{ business_id }` alone per
 * the link/create union contract (#69); business edits go through the owner
 * member's edit page (#71 re-links from there).
 */
export function SelectedBusinessCard({ business, onClear, editMode = false }: SelectedBusinessCardProps) {
	return (
		<div data-slot="wizard-selected-business" className="border-primary/30 bg-primary/5 rounded-xl border p-4">
			<div className="text-primary flex items-center gap-1 text-xs font-medium" data-slot="wizard-selected-business-chip">
				<span className="flex shrink-0 items-center" aria-hidden="true">
					<HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-3.5" />
				</span>
				{editMode ? "เลือกกิจการแล้ว — สมาชิกคนนี้จะย้ายไปผูกกับกิจการนี้" : "เลือกกิจการแล้ว — สมาชิกใหม่จะผูกกับกิจการนี้"}
			</div>
			<div className="mt-2 flex items-start gap-3">
				<span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
					<HugeiconsIcon icon={Building01Icon} className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-bold">{business.name}</div>
					<div className="text-muted-foreground truncate text-xs">เลขทะเบียนนิติบุคคล: {business.juristic_registration_no}</div>
				</div>
				<button
					type="button"
					onClick={onClear}
					className="text-muted-foreground hover:text-destructive p-1.5"
					aria-label="เปลี่ยนกิจการ"
					title="เปลี่ยนกิจการ"
					data-slot="wizard-clear-business"
				>
					<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
				</button>
			</div>
			<dl className="mt-3 space-y-1 text-sm">
				<div className="flex gap-2">
					<dt className="text-muted-foreground w-24 shrink-0">หมวดธุรกิจ</dt>
					<dd className="min-w-0">{business.category_name}</dd>
				</div>
				{business.address !== null && business.address !== "" && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground w-24 shrink-0">ที่อยู่</dt>
						<dd className="min-w-0">{business.address}</dd>
					</div>
				)}
				<div className="flex gap-2">
					<dt className="text-muted-foreground w-24 shrink-0">สมาชิกร่วม</dt>
					<dd className="flex min-w-0 items-center gap-1">
						<span className="text-muted-foreground flex shrink-0 items-center" aria-hidden="true">
							<HugeiconsIcon icon={UserMultiple03Icon} className="size-3.5" />
						</span>
						<span>
							{business.member_count} คน
							{business.owner_names.length > 0 && <span className="text-muted-foreground"> ({business.owner_names.join(" · ")})</span>}
						</span>
					</dd>
				</div>
			</dl>
			<div className="text-muted-foreground mt-3 flex items-start gap-1.5 border-t pt-2 text-xs">
				<span className="flex shrink-0 items-center" aria-hidden="true">
					<HugeiconsIcon icon={LockedIcon} className="size-3.5" />
				</span>
				<span>
					{editMode
						? "ข้อมูลกิจการอ่านอย่างเดียว — บันทึกแล้วสมาชิกคนนี้จะย้ายไปผูกกับกิจการนี้; แก้ไขข้อมูลกิจการที่หน้าสมาชิกเจ้าของกิจการ"
						: "ข้อมูลกิจการอ่านอย่างเดียว — บันทึกแล้วผูกสมาชิกใหม่เข้ากับกิจการนี้ ไม่สร้างข้อมูลซ้ำ; แก้ไขข้อมูลกิจการที่หน้าสมาชิกเจ้าของกิจการ"}
				</span>
			</div>
		</div>
	)
}
