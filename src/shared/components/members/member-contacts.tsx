"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Chat01Icon, Mail01Icon } from "@hugeicons/core-free-icons"

import type { MemberListItem } from "src/shared/components/members/members-types"
import { cn } from "src/shared/lib/utils/utils"

type MemberContactsProps = {
	member: Pick<MemberListItem, "phone_no" | "email" | "line_id">
	/** Table rows stack left-aligned; cards center each row. */
	align?: "start" | "center"
	className?: string
}

/** Contact rows (phone / email / LINE ID) shared by the table and card views. */
export function MemberContacts({ member, align = "start", className }: MemberContactsProps) {
	const centered = align === "center"
	return (
		<div className={cn("space-y-1 text-sm", centered && "space-y-2", className)}>
			<div className="text-muted-foreground flex items-center gap-2">
				<HugeiconsIcon icon={Call02Icon} data-slot="phone-icon" className="size-4" />
				<span>{member.phone_no === "" ? "-" : member.phone_no}</span>
			</div>
			<div className="text-muted-foreground flex items-center gap-2">
				<HugeiconsIcon icon={Mail01Icon} data-slot="email-icon" className="size-4" />
				<span className={cn("truncate", centered ? "max-w-45" : "max-w-40")} title={member.email ?? undefined}>
					{member.email ?? "-"}
				</span>
			</div>
			<div className="text-success flex items-center gap-2">
				<HugeiconsIcon icon={Chat01Icon} data-slot="line-icon" className="size-4" />
				<span>{member.line_id ?? "-"}</span>
			</div>
		</div>
	)
}
