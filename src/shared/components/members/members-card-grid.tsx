"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Chat01Icon, Delete02Icon, Mail01Icon } from "@hugeicons/core-free-icons"

import { fullNameTh, positionLabel } from "src/shared/components/members/member-labels"
import type { MemberListItem } from "src/shared/components/members/members-types"
import { StatusBadge } from "src/shared/components/members/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"

type MembersCardGridProps = {
	members: readonly MemberListItem[]
	/** Staff mode: status badge + delete button on hover. */
	isAdmin: boolean
	onDeleteClick: (member: MemberListItem) => void
}

/** Member directory card view (mockup card grid): responsive 1–4 columns. */
export function MembersCardGrid({ members, isAdmin, onDeleteClick }: MembersCardGridProps) {
	return (
		<div data-slot="members-card-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{members.map((member) => (
				<div key={member.id} data-slot="member-card" className="bg-card group relative flex h-full flex-col rounded-xl border p-5 transition-shadow hover:shadow-md">
					{isAdmin && (
						<div className="absolute top-3 left-3 z-10">
							<StatusBadge status={member.status} />
						</div>
					)}
					{isAdmin && (
						<div className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
							<Button
								variant="outline"
								size="icon"
								className="bg-card size-8 rounded-full shadow-sm"
								title="ลบสมาชิก"
								aria-label={`ลบสมาชิก ${fullNameTh(member)}`}
								onClick={() => onDeleteClick(member)}
							>
								<HugeiconsIcon icon={Delete02Icon} className="text-destructive size-4" />
							</Button>
						</div>
					)}
					<div className="mt-2 mb-4 flex flex-col items-center text-center">
						<Avatar className="mb-3 size-20">
							{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
							<AvatarFallback className="text-2xl">{member.first_name_th.charAt(0)}</AvatarFallback>
						</Avatar>
						<h3 className="text-lg font-bold">
							{fullNameTh(member)} {member.nickname !== "" && <span className="text-muted-foreground text-sm font-normal">({member.nickname})</span>}
						</h3>
						<p className="text-primary mt-1 text-sm font-medium">{positionLabel(member.position)}</p>
					</div>
					<div className="mb-4 flex-1 space-y-2 text-center">
						<div className="bg-muted text-muted-foreground inline-block rounded px-2 py-1 text-sm font-semibold">{member.business.name}</div>
						<p className="text-muted-foreground mt-2 line-clamp-3 px-2 text-xs">{member.business.description === "" ? "-" : member.business.description}</p>
					</div>
					<div className="border-t py-4 text-sm">
						<div className="text-muted-foreground flex items-center justify-center gap-2">
							<HugeiconsIcon icon={Call02Icon} data-slot-icon="phone" className="size-4" />
							<span>{member.phone_no === "" ? "-" : member.phone_no}</span>
						</div>
						<div className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
							<HugeiconsIcon icon={Mail01Icon} data-slot-icon="email" className="size-4" />
							<span className="max-w-45 truncate">{member.email ?? "-"}</span>
						</div>
						<div className="mt-2 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400">
							<HugeiconsIcon icon={Chat01Icon} data-slot-icon="line" className="size-4" />
							<span>{member.line_id ?? "-"}</span>
						</div>
					</div>
				</div>
			))}
		</div>
	)
}
