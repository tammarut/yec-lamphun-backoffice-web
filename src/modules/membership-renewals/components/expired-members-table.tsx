"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar01Icon } from "@hugeicons/core-free-icons"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { fullNameTh, positionLabel } from "src/modules/membership-renewals/components/renewal-labels"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/shared/components/ui/table"

type ExpiredMembersTableProps = {
	/** The visible slice of the not-rejected expired rows (client +10 paging lives in the view). */
	members: readonly ExpiredMembershipResponse[]
	isAdmin: boolean
	/** Admin-only ดำเนินการ column — open the manual renewal form preselected with this member. */
	onManualRenew?: (member: ExpiredMembershipResponse) => void
}

/**
 * หมดอายุ — ยังไม่แจ้งต่ออายุ table (mockup v3). วันที่เป็นสมาชิก column per
 * the card's resync decision (member_since — NOT วันหมดอายุ). The admin
 * ดำเนินการ column (ต่ออายุ (Manual)) opens the PR 3 manual renewal form.
 */
export function ExpiredMembersTable({ members, isAdmin, onManualRenew }: ExpiredMembersTableProps) {
	const hasActions = isAdmin && onManualRenew !== undefined
	const columnCount = hasActions ? 4 : 3

	return (
		<div data-slot="expired-members-table" className="bg-card overflow-x-auto rounded-xl border">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50">
						<TableHead className="w-1/2">สมาชิก</TableHead>
						<TableHead>ประเภท</TableHead>
						<TableHead>วันที่เป็นสมาชิก</TableHead>
						{hasActions && <TableHead className="text-right">ดำเนินการ</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => (
						<TableRow key={member.id}>
							<TableCell>
								<div className="flex items-center gap-3">
									<Avatar className="size-10 shrink-0">
										{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
										<AvatarFallback>{member.first_name_th.charAt(0)}</AvatarFallback>
									</Avatar>
									<div className="min-w-0">
										<div className="font-medium">
											{fullNameTh(member)}
											{member.nickname !== "" && <span className="text-muted-foreground font-normal"> ({member.nickname})</span>}
										</div>
										<div className="text-muted-foreground text-sm">{member.phone_no}</div>
									</div>
								</div>
							</TableCell>
							<TableCell className="text-sm">{positionLabel(member.position)}</TableCell>
							<TableCell className="text-sm">
								<span className="text-warning inline-flex items-center gap-1.5">
									<HugeiconsIcon icon={Calendar01Icon} className="size-3.5" />
									{formatThaiDate(member.member_since)}
								</span>
							</TableCell>
							{hasActions && (
								<TableCell className="text-right">
									<Button
										size="sm"
										className="bg-success hover:bg-success/90 text-white"
										aria-label={`ต่ออายุแบบผู้ดูแลระบบให้ ${fullNameTh(member)}`}
										onClick={() => onManualRenew?.(member)}
									>
										ต่ออายุ (Manual)
									</Button>
								</TableCell>
							)}
						</TableRow>
					))}
					{members.length === 0 && (
						<TableRow>
							<TableCell colSpan={columnCount} className="text-muted-foreground py-8 text-center">
								ไม่พบข้อมูล
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	)
}
