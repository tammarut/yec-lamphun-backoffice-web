"use client"

import { useBusinessCategories, type BusinessCategoryOption } from "src/modules/members/hooks/use-business-categories"
import type { MemberBusinessResponse, MemberDetailResponse } from "src/modules/members/use-case/get-member-by-id/get-member-by-id.types"
import { Card, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"

import { DetailField, DetailImageField, nullableText, nullableWebsiteLink } from "./parts"

/** The เอกสาร section — the id-card copy and the company certificate as clickable inline previews. */
export function MemberDocumentsSection({ member }: { member: MemberDetailResponse }) {
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
export function MemberBusinessSection({ business }: { business: MemberBusinessResponse }) {
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
