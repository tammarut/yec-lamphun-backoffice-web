"use client"

import { ArrowLeft01Icon, Delete02Icon, Edit01Icon, Refresh01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { DeleteMemberDialog } from "src/modules/members/components/delete-member-dialog"
import { codeLabel, fullNameTh, GENDER_LABELS, positionLabel, REGISTRATION_TYPE_LABELS, SHIRT_SIZE_LABELS } from "src/modules/members/components/member-labels"
import { MemberWizardDialog } from "src/modules/members/components/member-wizard-dialog"
import { StatusBadge } from "src/modules/members/components/status-badge"
import { useBusinessCategories, type BusinessCategoryOption } from "src/modules/members/hooks/use-business-categories"
import { memberDetailQueryKey, useMemberDetail } from "src/modules/members/hooks/use-member-detail"
import { useDeleteMember } from "src/modules/members/hooks/use-members"
import { formatThaiDate } from "src/modules/members/schemas/member-wizard-mapping"
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

/** Optional API strings arrive as null — or "" on direct API writes (the wizard normalizes to null). Both read as empty. */
function isEmptyText(value: string | null): value is null | "" {
	return value === null || value === ""
}

/** The value cell for an optional field: an empty value renders the stable em dash. */
function nullableText(value: string | null): ReactNode {
	if (isEmptyText(value)) {
		return <span className="text-muted-foreground">—</span>
	}
	return value
}

/**
 * Every URL the API hands back is a free string (website is user-typed; file
 * fields accept any string on a direct write), so only an explicit http(s)
 * scheme may become an anchor: scheme-less text would resolve as a relative
 * path on this origin, and `javascript:` would run on click.
 */
const HTTP_URL_PATTERN = /^https?:\/\//i

/** Optional website cell: empty → em dash; http(s) → new-tab link; any other text renders inert. */
function nullableWebsiteLink(value: string | null): ReactNode {
	if (isEmptyText(value)) {
		return nullableText(null)
	}
	if (!HTTP_URL_PATTERN.test(value)) {
		return value
	}
	return (
		<a href={value} target="_blank" rel="noopener noreferrer" className="text-primary [overflow-wrap:anywhere] underline-offset-4 hover:underline">
			{value}
		</a>
	)
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

/** New-tab link for a document/file URL (presigned or public); a non-http(s) value renders as inert text instead. */
function DetailFileLink({ href }: { href: string }) {
	if (!HTTP_URL_PATTERN.test(href)) {
		return href
	}
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
			เปิดดู
		</a>
	)
}

/**
 * Inline image preview: renders the image itself, and the whole preview is a
 * new-tab link to the full-size file. An expired presign or a non-image value
 * falls back to the plain เปิดดู link; a non-http(s) value renders inert, the
 * same rule as every other URL on this page.
 */
function DetailImagePreview({ url, label }: { url: string; label: string }) {
	const [isBroken, setIsBroken] = useState(false)
	if (isBroken || !HTTP_URL_PATTERN.test(url)) {
		return (
			<span className="text-sm">
				<DetailFileLink href={url} />
			</span>
		)
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`เปิด${label}ขนาดเต็ม`}
			title="เปิดดูขนาดเต็ม"
			className="focus-visible:ring-ring/50 hover:ring-ring/30 w-fit rounded-lg transition-shadow outline-none hover:ring-[3px] focus-visible:ring-[3px]"
		>
			{/* eslint-disable-next-line @next/next/no-img-element -- remote presigned/public R2 URL; next/image adds nothing */}
			<img src={url} alt={label} loading="lazy" onError={() => setIsBroken(true)} className="bg-muted h-40 w-64 max-w-full rounded-lg border object-contain" />
		</a>
	)
}

/** Image field row: the label sits above the inline preview (empty → em dash). */
function DetailImageField({ label, value }: { label: string; value: string | null }) {
	return (
		<div data-slot="member-detail-field" className="flex min-w-0 flex-col gap-1.5">
			<span className="text-muted-foreground text-sm">{label}</span>
			{isEmptyText(value) ? <span className="text-sm">{nullableText(null)}</span> : <DetailImagePreview url={value} label={label} />}
		</div>
	)
}

/** The เอกสาร section — the id-card copy and the company certificate as clickable inline previews. */
function MemberDocumentsSection({ member }: { member: MemberDetailResponse }) {
	return (
		<Card data-slot="member-detail-section-documents">
			<CardHeader>
				<CardTitle>เอกสาร</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
				<DetailImageField label="สำเนาบัตรประชาชน" value={member.id_card_image} />
				<DetailImageField label="หนังสือรับรองบริษัท/ทะเบียนพาณิชย์" value={member.company_certificate} />
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
				<DetailField label="เว็บไซต์">{nullableWebsiteLink(business.website)}</DetailField>
				<DetailField label="จำนวนสมาชิกในธุรกิจ">{String(business.member_count)}</DetailField>
				{/* The two image cells share one grid row so the previews line up. */}
				<DetailImageField label="โลโก้" value={business.logo} />
				<DetailImageField label="ผลิตภัณฑ์" value={business.product} />
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
	const [wizardMounted, setWizardMounted] = useState(false)
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

	// Mount-latch (members-view.tsx rule): once opened, the wizard instance
	// stays mounted through onOpenChange(false) so its post-save success
	// dialog can paint; only `open` toggles. The route unmount releases it.
	const openEditWizard = () => {
		setWizardMounted(true)
		setEditOpen(true)
	}

	// Cache cleanup (list reset for the keyset anchors, ADR-0011, plus this
	// member's detail purge) is owned by useDeleteMember; this view adds the
	// toast and the return to /members.
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
						<Button variant="outline" onClick={openEditWizard} data-slot="member-detail-edit">
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
					{/* Thai names in the left column, English names in the right — each
					    column reads top-to-bottom on desktop, stacks TH-then-EN on
					    mobile. Status stays in the header only; shirt size lives here. */}
					<div data-slot="member-detail-name-th" className="flex min-w-0 flex-col gap-3">
						<DetailField label="คำนำหน้าชื่อ (ไทย)">{member.title_name_th}</DetailField>
						<DetailField label="ชื่อ (ไทย)">{member.first_name_th}</DetailField>
						<DetailField label="นามสกุล (ไทย)">{member.last_name_th}</DetailField>
					</div>
					<div data-slot="member-detail-name-en" className="flex min-w-0 flex-col gap-3">
						<DetailField label="คำนำหน้าชื่อ (อังกฤษ)">{nullableText(member.title_name_en)}</DetailField>
						<DetailField label="ชื่อ (อังกฤษ)">{nullableText(member.first_name_en)}</DetailField>
						<DetailField label="นามสกุล (อังกฤษ)">{nullableText(member.last_name_en)}</DetailField>
					</div>
					<DetailField label="ชื่อเล่น">{member.nickname}</DetailField>
					<DetailField label="เพศ">{codeLabel(GENDER_LABELS, member.gender)}</DetailField>
					<DetailField label="วันเดือนปีเกิด">{formatThaiDate(member.date_of_birth)}</DetailField>
					<DetailField label="สัญชาติ">{member.nationality}</DetailField>
					<DetailField label="เลขบัตรประชาชน">{nullableText(member.id_card_no)}</DetailField>
					<DetailField label="วันหมดอายุบัตร">{formatThaiDate(member.id_card_expiry_date)}</DetailField>
					<DetailField label="ประเภทสมาชิก">{codeLabel(REGISTRATION_TYPE_LABELS, member.registration_type)}</DetailField>
					<DetailField label="เป็นสมาชิกตั้งแต่">{formatThaiDate(member.member_since)}</DetailField>
					<DetailField label="วันหมดอายุสมาชิก">{member.expires_at === null ? nullableText(null) : formatThaiDate(member.expires_at)}</DetailField>
					<DetailField label="ขนาดเสื้อ">{member.shirt_size === null ? nullableText(null) : codeLabel(SHIRT_SIZE_LABELS, member.shirt_size)}</DetailField>
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
			    refreshes without any wiring here. The key remounts the instance
			    if the route param ever changes while the page stays mounted. */}
			{wizardMounted ? <MemberWizardDialog key={`edit-${memberId}`} open={editOpen} onOpenChange={setEditOpen} editMember={{ id: memberId }} /> : null}
		</div>
	)
}
