"use client"

import { CheckmarkCircle02Icon, Edit01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useFormContext } from "react-hook-form"

import { Button } from "src/shared/components/ui/button"
import { MemberExistingFileThumb, MemberFileThumb } from "src/modules/members/components/member-wizard-file-field"
import { useMemberWizardEdit } from "src/modules/members/components/member-wizard-edit-context"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"
import { GENDER_LABELS, POSITION_LABELS, REGISTRATION_TYPE_LABELS, SHIRT_SIZE_LABELS } from "src/modules/members/components/member-labels"
import { StatusBadge } from "src/modules/members/components/status-badge"
import { useBusinessCategories } from "src/modules/members/hooks/use-business-categories"
import { formatIdCardNo, formatThaiDate, memberFileLabel } from "src/modules/members/schemas/member-wizard-mapping"
import type { MemberWizardFileFieldName, MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { cn } from "src/shared/lib/utils/utils"

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
	const empty = value === null || value === undefined || value === ""
	return (
		<div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-3">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className={cn("col-span-2 text-sm", empty && "text-muted-foreground italic")}>{empty ? "-" : value}</dd>
		</div>
	)
}

/** Thumbnail + filename for a staged or stored Member File; ไม่ได้แนบ renders as plain text upstream. */
function FileValue({ value, name }: { value: { file: File | null; existingUrl: string | null }; name: MemberWizardFileFieldName }) {
	const edit = useMemberWizardEdit()
	const liveUrl = value.file === null ? (edit?.existingUrls[name] ?? null) : null
	return (
		<span className="flex items-center gap-2">
			{value.file !== null ? (
				<MemberFileThumb file={value.file} className="border-border size-10 rounded-md border" />
			) : liveUrl !== null ? (
				<MemberExistingFileThumb url={liveUrl} field={name} onError={edit?.onExistingImageError} className="border-border size-10 rounded-md border" />
			) : null}
			{memberFileLabel(value)}
		</span>
	)
}

function ReviewSection({ title, step, onEdit, children }: { title: string; step: 1 | 2 | 3; onEdit: (step: 1 | 2 | 3) => void; children: React.ReactNode }) {
	return (
		<Card data-slot="wizard-review-section" data-step={step}>
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
				<CardAction>
					<Button type="button" variant="outline" size="sm" onClick={() => onEdit(step)}>
						<HugeiconsIcon icon={Edit01Icon} className="size-4" />
						แก้ไข
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="pt-0">
				<dl className="divide-y">{children}</dl>
			</CardContent>
		</Card>
	)
}

/** Wizard step 4 — ตรวจสอบข้อมูล: three review sections with แก้ไข jump-backs. */
export function MemberWizardStepReview({ onEdit }: { onEdit: (step: 1 | 2 | 3) => void }) {
	const { getValues } = useFormContext<MemberWizardFormValues>()
	const values = getValues()
	const edit = useMemberWizardEdit()
	const categoriesQuery = useBusinessCategories()
	const categoryName = categoriesQuery.data?.find((category) => String(category.id) === values.business.category_id)?.category_name ?? "-"
	// Blank id_card_no in edit mode keeps the stored card — show the Masked ID
	// Card (display-only, from the detail response) with the คงค่าเดิม hint.
	const idCardReview =
		edit !== null && values.id_card_no.trim() === "" ? (edit.maskedIdCardNo !== null ? `${edit.maskedIdCardNo} (คงค่าเดิม)` : "คงค่าเดิม") : formatIdCardNo(values.id_card_no)

	return (
		<div data-slot="wizard-step-review" className="flex flex-col gap-4">
			<div className="text-success border-success/30 bg-success/10 flex items-start gap-2 rounded-xl border p-4 text-sm">
				<HugeiconsIcon icon={CheckmarkCircle02Icon} className="mt-0.5 size-4 shrink-0" />
				<span>ตรวจสอบข้อมูลทั้งหมดก่อนบันทึก หากต้องการแก้ไขส่วนใด กดปุ่ม &quot;แก้ไข&quot; ของหมวดนั้นๆ ได้เลย</span>
			</div>

			<ReviewSection title="ข้อมูลการสมัคร" step={1} onEdit={onEdit}>
				<ReviewRow label="ประเภทการสมัคร" value={REGISTRATION_TYPE_LABELS[values.registration_type] ?? values.registration_type} />
				<ReviewRow
					label="หนังสือรับรองบริษัท"
					value={
						values.company_certificate.file === null && values.company_certificate.existingUrl === null ? (
							""
						) : (
							<FileValue value={values.company_certificate} name="company_certificate" />
						)
					}
				/>
				<ReviewRow
					label="สำเนาบัตรประชาชน"
					value={values.id_card_image.file === null && values.id_card_image.existingUrl === null ? "" : <FileValue value={values.id_card_image} name="id_card_image" />}
				/>
			</ReviewSection>

			<ReviewSection title="ข้อมูลส่วนตัว" step={2} onEdit={onEdit}>
				<ReviewRow label="ชื่อ-นามสกุล (TH)" value={`${values.title_name_th}${values.first_name_th} ${values.last_name_th}`} />
				<ReviewRow
					label="ชื่อ-นามสกุล (EN)"
					value={values.first_name_en === "" && values.last_name_en === "" ? "" : `${values.title_name_en} ${values.first_name_en} ${values.last_name_en}`.trim()}
				/>
				<ReviewRow label="ชื่อเล่น" value={values.nickname} />
				<ReviewRow label="เพศ" value={GENDER_LABELS[values.gender] ?? values.gender} />
				<ReviewRow label="วันเดือนปีเกิด" value={values.date_of_birth} />
				<ReviewRow label="เลขบัตรประชาชน" value={idCardReview} />
				<ReviewRow label="วันหมดอายุบัตร" value={values.id_card_expiry_date} />
				<ReviewRow label="สัญชาติ" value={values.nationality} />
				<ReviewRow
					label="รูปโปรไฟล์"
					value={
						values.profile_avatar.file === null && values.profile_avatar.existingUrl === null ? "" : <FileValue value={values.profile_avatar} name="profile_avatar" />
					}
				/>
				<ReviewRow label="เบอร์โทรศัพท์" value={values.phone_no} />
				<ReviewRow label="อีเมล" value={values.email} />
				<ReviewRow label="Line ID" value={values.line_id} />
				<ReviewRow label="ไซส์เสื้อ" value={values.shirt_size === "" ? "" : (SHIRT_SIZE_LABELS[values.shirt_size] ?? values.shirt_size)} />
				<ReviewRow label="ตำแหน่งใน YEC Lamphun" value={POSITION_LABELS[values.position] ?? values.position} />
				<ReviewRow label="เป็นสมาชิกตั้งแต่" value={edit !== null ? formatThaiDate(edit.renewal.memberSince) : "ระบบจะคำนวณอัตโนมัติ"} />
				<ReviewRow
					label="สถานะสมาชิก"
					value={
						edit !== null ? (
							<span className="inline-flex items-center">
								<StatusBadge status={edit.renewal.status} />
							</span>
						) : (
							"ระบบจะระบุอัตโนมัติ"
						)
					}
				/>
			</ReviewSection>

			<ReviewSection title="ข้อมูลธุรกิจ" step={3} onEdit={onEdit}>
				<ReviewRow label="ชื่อกิจการ/ร้านค้า" value={values.business.name} />
				<ReviewRow label="เลขทะเบียนนิติบุคคล" value={values.business.juristic_registration_no} />
				<ReviewRow label="หมวดธุรกิจหลัก" value={categoryName} />
				<ReviewRow label="ที่อยู่กิจการ" value={values.business.address} />
				<ReviewRow
					label="พิกัด"
					value={values.business.latitude === "" || values.business.longitude === "" ? "" : `${values.business.latitude}, ${values.business.longitude}`}
				/>
				<ReviewRow label="รายละเอียดกิจการ" value={values.business.description} />
				<ReviewRow label="ผลิตภัณฑ์/บริการหลัก" value={values.business.core_business} />
				<ReviewRow label="Website" value={values.business.website} />
				<ReviewRow
					label="โลโก้"
					value={values.business.logo.file === null && values.business.logo.existingUrl === null ? "" : <FileValue value={values.business.logo} name="business.logo" />}
				/>
				<ReviewRow
					label="รูปผลิตภัณฑ์"
					value={
						values.business.product.file === null && values.business.product.existingUrl === null ? (
							""
						) : (
							<FileValue value={values.business.product} name="business.product" />
						)
					}
				/>
			</ReviewSection>
		</div>
	)
}
