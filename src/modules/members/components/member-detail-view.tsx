"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, Delete02Icon, Edit01Icon, Refresh01Icon } from "@hugeicons/core-free-icons"

import { DeleteMemberDialog } from "src/modules/members/components/delete-member-dialog"
import { codeLabel, fullNameTh, GENDER_LABELS, positionLabel, REGISTRATION_TYPE_LABELS, SHIRT_SIZE_LABELS, statusBadgeLabel } from "src/modules/members/components/member-labels"
import { MemberWizardDialog } from "src/modules/members/components/member-wizard-dialog"
import { StatusBadge } from "src/modules/members/components/status-badge"
import { useBusinessCategories, type BusinessCategoryOption } from "src/modules/members/hooks/use-business-categories"
import { memberDetailQueryKey, useMemberDetail } from "src/modules/members/hooks/use-member-detail"
import { useDeleteMember } from "src/modules/members/hooks/use-members"
import type { MemberBusinessResponse, MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { useSession } from "src/shared/lib/api/session"

type MemberDetailViewProps = {
	/**
	 * The member id parsed from the URL segment; null when the segment is not
	 * a number, which renders the ไม่พบสมาชิก state without any fetch.
	 */
	memberId: number | null
}

/** Thai short-date display for an ISO date/datetime (th-TH → Buddhist Era, e.g. "12 ส.ค. 2569"). */
function formatThaiDate(isoDateTime: string): string {
	const date = new Date(isoDateTime)
	if (Number.isNaN(date.getTime())) {
		return "-"
	}
	return date.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
}

/** The value cell for an optional field: null renders the stable em dash. */
function nullableText(value: string | null): ReactNode {
	if (value === null) {
		return <span className="text-muted-foreground">—</span>
	}
	return value
}

/** Optional file/document URL cell: null renders the em dash, otherwise a new-tab link. */
function nullableFileLink(value: string | null): ReactNode {
	if (value === null) {
		return nullableText(null)
	}
	return <DetailFileLink href={value} />
}

/** One labelled field row: label column on desktop, stacked on mobile. */
function DetailField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div data-slot="member-detail-field" className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
			<span className="text-muted-foreground w-44 shrink-0 text-sm">{label}</span>
			<span className="min-w-0 text-sm [overflow-wrap:anywhere]">{children}</span>
		</div>
	)
}

/** New-tab link for a document/file URL (presigned or public). */
function DetailFileLink({ href }: { href: string }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
			เปิดดู
		</a>
	)
}

/** The document/image section rows — avatar, id-card image, certificate, shirt size. */
function MemberDocumentsSection({ member }: { member: MemberDetailResponse }) {
	return (
		<Card data-slot="member-detail-section-documents">
			<CardHeader>
				<CardTitle>เอกสารและรูปภาพ</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
				<DetailField label="รูปโปรไฟล์">{nullableFileLink(member.profile_avatar)}</DetailField>
				<DetailField label="สำเนาบัตรประชาชน">{nullableFileLink(member.id_card_image)}</DetailField>
				<DetailField label="หนังสือรับรองบริษัท/ทะเบียนพาณิชย์">{nullableFileLink(member.company_certificate)}</DetailField>
				<DetailField label="ขนาดเสื้อ">{member.shirt_size === null ? nullableText(null) : codeLabel(SHIRT_SIZE_LABELS, member.shirt_size)}</DetailField>
			</CardContent>
		</Card>
	)
}

/** Category label from the live-fed options; the raw id stands in until they load. */
function businessCategoryLabel(options: BusinessCategoryOption[] | undefined, categoryId: number): string {
	if (options === undefined) {
		return String(categoryId)
	}
	for (const option of options) {
		if (option.id === categoryId) {
			return option.category_name
		}
	}
	return String(categoryId)
}

/** The ธุรกิจ section. Owns the categories query so it only fetches when detail data is on screen. */
function MemberBusinessSection({ business }: { business: MemberBusinessResponse }) {
	const categoriesQuery = useBusinessCategories()
	return (
		<Card data-slot="member-detail-section-business">
			<CardHeader>
				<CardTitle>ธุรกิจ</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
				<DetailField label="ชื่อกิจการ">{business.name}</DetailField>
				<DetailField label="รายละเอียดกิจการ">{business.description}</DetailField>
				<DetailField label="เลขทะเบียนนิติบุคคล">{business.juristic_registration_no}</DetailField>
				<DetailField label="หมวดธุรกิจหลัก">{businessCategoryLabel(categoriesQuery.data, business.category_id)}</DetailField>
				<DetailField label="ที่อยู่กิจการ">{nullableText(business.address)}</DetailField>
				<DetailField label="ธุรกิจหลัก">{nullableText(business.core_business)}</DetailField>
				<DetailField label="เว็บไซต์">
					{business.website === null ? (
						nullableText(null)
					) : (
						<a href={business.website} target="_blank" rel="noopener noreferrer" className="text-primary [overflow-wrap:anywhere] underline-offset-4 hover:underline">
							{business.website}
						</a>
					)}
				</DetailField>
				<DetailField label="โลโก้">{nullableFileLink(business.logo)}</DetailField>
				<DetailField label="ผลิตภัณฑ์">{nullableFileLink(business.product)}</DetailField>
				<DetailField label="จำนวนสมาชิกในธุรกิจ">{String(business.member_count)}</DetailField>
			</CardContent>
		</Card>
	)
}

function MemberDetailSkeleton() {
	return (
		<div data-slot="member-detail-skeleton" className="mx-auto flex w-full max-w-4xl flex-col gap-6" aria-busy="true" aria-label="กำลังโหลดข้อมูลสมาชิก">
			<Skeleton className="h-8 w-24" />
			<div className="flex items-center gap-4">
				<Skeleton className="size-16 rounded-full" />
				<div className="flex-1 space-y-2">
					<Skeleton className="h-6 w-56" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
			{Array.from({ length: 4 }, (_, index) => (
				<Skeleton key={index} className="h-48 rounded-2xl" />
			))}
		</div>
	)
}

/** Unknown id (API 404 or a non-numeric URL segment) — dedicated empty state, back through history. */
function MemberDetailNotFound() {
	const router = useRouter()
	return (
		<div data-slot="member-detail-not-found" className="rounded-2xl border border-dashed py-12 text-center">
			<p className="text-muted-foreground">ไม่พบสมาชิก</p>
			<Button variant="outline" className="mt-4" onClick={() => router.back()} data-slot="member-detail-back">
				<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
				ย้อนกลับ
			</Button>
		</div>
	)
}

/**
 * Member detail page content (tracer #143): identity header with the reused
 * edit wizard + delete confirmation, then four Thai-labelled sections over
 * exactly the `MemberDetailResponse` fields (null → "—"). Entered by URL for
 * now — list name links are ticket #144.
 */
export function MemberDetailView({ memberId }: MemberDetailViewProps) {
	const { isAdmin } = useSession()
	const router = useRouter()
	const queryClient = useQueryClient()
	const detailQuery = useMemberDetail(memberId)
	const deleteMutation = useDeleteMember()
	const [editOpen, setEditOpen] = useState(false)
	const [deleteArmed, setDeleteArmed] = useState(false)

	if (memberId === null) {
		return <MemberDetailNotFound />
	}
	if (detailQuery.isPending) {
		return <MemberDetailSkeleton />
	}
	if (detailQuery.isError) {
		if (detailQuery.error.status === 404) {
			return <MemberDetailNotFound />
		}
		// 401 (non-admin direct visit) and transient failures share this state:
		// the API-level gate means there is nothing to render instead.
		return (
			<div data-slot="member-detail-error" className="mx-auto w-full max-w-4xl">
				<Alert variant="destructive">
					<AlertTitle>โหลดข้อมูลสมาชิกไม่สำเร็จ</AlertTitle>
					<AlertDescription className="flex items-center gap-3">
						<span>{detailQuery.error.message}</span>
						<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: memberDetailQueryKey(memberId) })}>
							<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
							ลองใหม่
						</Button>
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	const member = detailQuery.data

	// The list cache reset is owned by useDeleteMember (keyset anchors,
	// ADR-0011); this view adds the toast and the return to /members.
	const confirmDelete = () => {
		deleteMutation.mutate(memberId, {
			onSuccess: () => {
				toast.success("ลบสมาชิกเรียบร้อย")
				router.push("/members")
			},
			onError: (error) => {
				toast.error(error.message)
			},
		})
	}

	return (
		<div data-slot="member-detail-view" className="mx-auto flex w-full max-w-4xl flex-col gap-6">
			<div>
				<Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()} data-slot="member-detail-back">
					<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
					ย้อนกลับ
				</Button>
			</div>

			<header data-slot="member-detail-header" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-4">
					<Avatar className="size-16">
						{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
						<AvatarFallback className="text-xl">{member.first_name_th.charAt(0)}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
							<h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{fullNameTh(member)}</h1>
							{isAdmin ? <StatusBadge status={member.status} /> : null}
						</div>
						<p className="text-muted-foreground">{positionLabel(member.position)}</p>
					</div>
				</div>
				{isAdmin ? (
					<div className="flex shrink-0 gap-2">
						<Button variant="outline" onClick={() => setEditOpen(true)} data-slot="member-detail-edit">
							<HugeiconsIcon icon={Edit01Icon} className="size-4" />
							แก้ไขข้อมูล
						</Button>
						<Button variant="destructive" onClick={() => setDeleteArmed(true)} data-slot="member-detail-delete">
							<HugeiconsIcon icon={Delete02Icon} className="size-4" />
							ลบสมาชิก
						</Button>
					</div>
				) : null}
			</header>

			<Card data-slot="member-detail-section-personal">
				<CardHeader>
					<CardTitle>ข้อมูลส่วนตัว</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
					<DetailField label="คำนำหน้าชื่อ (ไทย)">{member.title_name_th}</DetailField>
					<DetailField label="ชื่อ (ไทย)">{member.first_name_th}</DetailField>
					<DetailField label="นามสกุล (ไทย)">{member.last_name_th}</DetailField>
					<DetailField label="คำนำหน้าชื่อ (อังกฤษ)">{nullableText(member.title_name_en)}</DetailField>
					<DetailField label="ชื่อ (อังกฤษ)">{nullableText(member.first_name_en)}</DetailField>
					<DetailField label="นามสกุล (อังกฤษ)">{nullableText(member.last_name_en)}</DetailField>
					<DetailField label="ชื่อเล่น">{member.nickname}</DetailField>
					<DetailField label="เพศ">{codeLabel(GENDER_LABELS, member.gender)}</DetailField>
					<DetailField label="วันเดือนปีเกิด">{formatThaiDate(member.date_of_birth)}</DetailField>
					<DetailField label="สัญชาติ">{member.nationality}</DetailField>
					<DetailField label="เลขบัตรประชาชน">{nullableText(member.id_card_no)}</DetailField>
					<DetailField label="วันหมดอายุบัตร">{formatThaiDate(member.id_card_expiry_date)}</DetailField>
					<DetailField label="ประเภทสมาชิก">{codeLabel(REGISTRATION_TYPE_LABELS, member.registration_type)}</DetailField>
					<DetailField label="เป็นสมาชิกตั้งแต่">{formatThaiDate(member.member_since)}</DetailField>
					<DetailField label="วันหมดอายุสมาชิก">{member.expires_at === null ? nullableText(null) : formatThaiDate(member.expires_at)}</DetailField>
					<DetailField label="สถานะ">{isAdmin ? <StatusBadge status={member.status} /> : <span>{statusBadgeLabel(member.status)}</span>}</DetailField>
				</CardContent>
			</Card>

			<Card data-slot="member-detail-section-contact">
				<CardHeader>
					<CardTitle>ข้อมูลติดต่อ</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
					<DetailField label="เบอร์โทรศัพท์">{member.phone_no}</DetailField>
					<DetailField label="อีเมล">{nullableText(member.email)}</DetailField>
					<DetailField label="LINE ID">{nullableText(member.line_id)}</DetailField>
				</CardContent>
			</Card>

			<MemberDocumentsSection member={member} />

			<MemberBusinessSection business={member.business} />

			<DeleteMemberDialog
				member={deleteArmed ? member : null}
				isDeleting={deleteMutation.isPending}
				onOpenChange={(open) => {
					if (!open && !deleteMutation.isPending) {
						setDeleteArmed(false)
					}
				}}
				onConfirm={confirmDelete}
			/>

			{/* Edit wizard (reused): fetches GET /:id itself and pre-fills; the
			    update hook invalidates this detail query on save, so the view
			    refreshes without any wiring here. Kept mounted only while open —
			    the route remount supplies a fresh instance per member. */}
			{editOpen ? <MemberWizardDialog key={`edit-${memberId}`} open={editOpen} onOpenChange={setEditOpen} editMember={{ id: memberId }} /> : null}
		</div>
	)
}
