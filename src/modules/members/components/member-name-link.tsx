import Link from "next/link"

import { fullNameTh } from "src/modules/members/components/member-labels"
import type { MemberListItem } from "src/modules/members/components/members-types"

/**
 * The member's glued Thai name as a client-side link to `/members/:id`
 * (#144). The caller gates rendering on `isAdmin` — a non-admin gets plain
 * text and no click affordance. The nickname stays outside so the link's
 * accessible name is the name alone.
 */
export function MemberNameLink({ member }: { member: MemberListItem }) {
	return (
		<Link
			href={`/members/${member.id}`}
			data-slot="member-name-link"
			className="focus-visible:ring-ring/50 rounded-xs underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2"
		>
			{fullNameTh(member)}
		</Link>
	)
}
