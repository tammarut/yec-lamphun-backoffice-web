import { MemberDetailView } from "src/modules/members/components/member-detail-view"

type MemberDetailPageProps = {
	params: Promise<{ member_id: string }>
}

/**
 * `/members/[member_id]` — the route is public-viewable like every page; real
 * authorization is API-level (`withAuth` → 401), which the view surfaces as
 * its error state. A non-numeric segment renders ไม่พบสมาชิก without fetching.
 */
export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
	const { member_id } = await params
	const parsedId = Number.parseInt(member_id, 10)
	const memberId = Number.isNaN(parsedId) ? null : parsedId
	return <MemberDetailView memberId={memberId} />
}
