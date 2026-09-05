"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Call02Icon, Chat01Icon, Delete02Icon, Mail01Icon } from "@hugeicons/core-free-icons"

import { fullNameTh, positionLabel } from "src/shared/components/members/member-labels"
import type { MemberListItem } from "src/shared/components/members/members-types"
import { StatusBadge } from "src/shared/components/members/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Checkbox } from "src/shared/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/shared/components/ui/table"
import { cn } from "src/shared/lib/utils/utils"

type MembersTableProps = {
	members: readonly MemberListItem[]
	/** Staff mode: checkbox column, status badges, จัดการ column. */
	isAdmin: boolean
	selectedIds: ReadonlySet<number>
	onToggleOne: (id: number, checked: boolean) => void
	onToggleAll: (checked: boolean) => void
	onDeleteClick: (member: MemberListItem) => void
}

/**
 * Member directory table (mockup list view). Columns: [admin checkbox] ·
 * ชื่อ-สกุล/ตำแหน่ง · ธุรกิจ/กิจการ · รายละเอียดธุรกิจ · ติดต่อ · [admin] จัดการ.
 */
export function MembersTable({ members, isAdmin, selectedIds, onToggleOne, onToggleAll, onDeleteClick }: MembersTableProps) {
	const allSelected = members.length > 0 && members.every((member) => selectedIds.has(member.id))
	const someSelected = members.some((member) => selectedIds.has(member.id))

	return (
		<div data-slot="members-table" className="bg-card overflow-hidden rounded-xl border">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/50">
						{isAdmin && (
							<TableHead className="w-10">
								<Checkbox
									aria-label="เลือกทั้งหมด"
									checked={allSelected ? true : someSelected ? "indeterminate" : false}
									onCheckedChange={(checked) => onToggleAll(checked === true)}
								/>
							</TableHead>
						)}
						<TableHead className="w-1/4">ชื่อ-สกุล / ตำแหน่ง</TableHead>
						<TableHead className="w-1/5">ธุรกิจ/กิจการ</TableHead>
						<TableHead className="w-1/4">รายละเอียดธุรกิจ</TableHead>
						<TableHead className="w-1/6">ติดต่อ</TableHead>
						{isAdmin && <TableHead className="text-right">จัดการ</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => {
						const selected = selectedIds.has(member.id)
						return (
							<TableRow key={member.id} data-selected={selected || undefined} className={cn(selected && "bg-primary/5 hover:bg-primary/5")}>
								{isAdmin && (
									<TableCell>
										<Checkbox
											aria-label={`เลือก ${fullNameTh(member)}`}
											checked={selected}
											onCheckedChange={(checked) => onToggleOne(member.id, checked === true)}
										/>
									</TableCell>
								)}
								<TableCell>
									<div className="flex items-start gap-3">
										<div className="flex w-14 shrink-0 flex-col items-center gap-1">
											<Avatar className="size-12">
												{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
												<AvatarFallback className="text-base">{member.first_name_th.charAt(0)}</AvatarFallback>
											</Avatar>
											{isAdmin && <StatusBadge status={member.status} />}
										</div>
										<div className="min-w-0">
											<div className="text-base font-semibold">
												{fullNameTh(member)} {member.nickname !== "" && <span className="text-muted-foreground font-normal">({member.nickname})</span>}
											</div>
											<div className="text-primary mt-0.5 text-sm font-medium">{positionLabel(member.position)}</div>
										</div>
									</div>
								</TableCell>
								<TableCell className="align-top">
									<div className="mt-2 font-medium">{member.business.name}</div>
								</TableCell>
								<TableCell className="align-top">
									<div className="text-muted-foreground mt-2 line-clamp-2 text-sm whitespace-normal">
										{member.business.description === "" ? "-" : member.business.description}
									</div>
								</TableCell>
								<TableCell className="align-top">
									<div className="mt-1 space-y-1 text-sm">
										<div className="text-muted-foreground flex items-center gap-2">
											<HugeiconsIcon icon={Call02Icon} data-slot-icon="phone" className="size-4" />
											<span>{member.phone_no === "" ? "-" : member.phone_no}</span>
										</div>
										<div className="text-muted-foreground flex items-center gap-2">
											<HugeiconsIcon icon={Mail01Icon} data-slot-icon="email" className="size-4" />
											<span className="max-w-40 truncate" title={member.email ?? undefined}>
												{member.email ?? "-"}
											</span>
										</div>
										<div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
											<HugeiconsIcon icon={Chat01Icon} data-slot-icon="line" className="size-4" />
											<span>{member.line_id ?? "-"}</span>
										</div>
									</div>
								</TableCell>
								{isAdmin && (
									<TableCell className="align-top">
										<div className="flex justify-end">
											<Button
												variant="ghost"
												size="icon"
												className="text-muted-foreground hover:text-destructive"
												title="ลบสมาชิก"
												aria-label={`ลบสมาชิก ${fullNameTh(member)}`}
												onClick={() => onDeleteClick(member)}
											>
												<HugeiconsIcon icon={Delete02Icon} className="size-4" />
											</Button>
										</div>
									</TableCell>
								)}
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}
