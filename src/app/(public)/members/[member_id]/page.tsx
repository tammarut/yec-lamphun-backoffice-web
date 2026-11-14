import { MemberDetailView } from "src/modules/members/components/member-detail-view"
import { parseMemberIdParam } from "src/modules/members/schemas/member-id-param"

type MemberDetailPageProps = {
	params: Promise<{ member_id: string }>
}

/**
 * `/members/[member_id]` — the route is public-viewable like every page
 * (ADR-0031); real authorization is API-level (`withAuth` → 401), which the
 * view surfaces as its error state. A non-canonical segment renders
 * ไม่พบสมาชิก without fetching.
 */
export default async function MemberDetailPage({ params }: MemberDetailPageProps) {
	const { member_id } = await params
	const memberId = parseMemberIdParam(member_id)
	return <MemberDetailView memberId={memberId} />
}
