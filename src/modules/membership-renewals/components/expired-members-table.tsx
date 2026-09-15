"use client"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { fullNameTh, positionLabel } from "src/modules/membership-renewals/components/renewal-labels"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/shared/components/ui/table"

type ExpiredMembersTableProps = {
	/** The visible slice of the not-rejected expired rows (client +10 paging lives in the view). */
	members: readonly ExpiredMembershipResponse[]
}

/**
 * หมดอายุ — ยังไม่แจ้งต่ออายุ table (mockup v3). วันที่เป็นสมาชิก column per
 * the card's resync decision (member_since — NOT วันหมดอายุ). The admin
 * ดำเนินการ column (ต่ออายุ (Manual)) arrives with PR 3's write flows.
 */
export function ExpiredMembersTable({ members }: ExpiredMembersTableProps) {
	return (
		<div data-slot="expired-members-table" className="bg-card overflow-x-auto rounded-xl border">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50">
						<TableHead className="w-1/2">สมาชิก</TableHead>
						<TableHead>ประเภท</TableHead>
						<TableHead>วันที่เป็นสมาชิก</TableHead>
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
							<TableCell className="text-sm">{formatThaiDate(member.member_since)}</TableCell>
						</TableRow>
					))}
					{members.length === 0 && (
						<TableRow>
							<TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
								ไม่พบข้อมูล
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	)
}
