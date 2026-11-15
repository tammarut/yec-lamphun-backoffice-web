import Link from "next/link"

import { fullNameTh } from "src/modules/members/components/member-labels"
import type { MemberListItem } from "src/modules/members/members-types"

type MemberNameProps = {
	member: MemberListItem
	/** Staff mode: the name becomes the detail-page link; otherwise plain text (#144). */
	isAdmin: boolean
}

/**
 * The member's glued Thai name — the single owner of the admin-gated
 * detail-page link (#144, scrutiny M1): the `isAdmin` decision lives here so
 * the two list views cannot drift apart or render the link un-gated. The
 * nickname stays outside the anchor so its accessible name is the name alone.
 */
export function MemberName({ member, isAdmin }: MemberNameProps) {
	return isAdmin ? (
		<Link
			href={`/members/${member.id}`}
			data-slot="member-name-link"
			className="focus-visible:ring-ring/50 decoration-muted-foreground/40 hover:decoration-foreground focus-visible:decoration-foreground rounded-xs underline underline-offset-4 outline-none focus-visible:ring-[3px]"
		>
			{fullNameTh(member)}
		</Link>
	) : (
		fullNameTh(member)
	)
}
