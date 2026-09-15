"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowDown01Icon, ArrowUp01Icon, Calendar01Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { fullNameTh } from "src/modules/membership-renewals/components/renewal-labels"
import { RenewalStatusBadge } from "src/modules/membership-renewals/components/renewal-status-badge"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { cn } from "src/shared/lib/utils/utils"

type RejectedRenewalPanelProps = {
	/** The expired rows whose latest renewal is REJECTED (already ordered first by the API). */
	rejectedRows: readonly ExpiredMembershipResponse[]
	isAdmin: boolean
	/** Rows are rendered only while expanded — the green all-clear state has nothing to collapse. */
	expanded: boolean
	onToggleExpanded: () => void
}

/**
 * The v3 ไม่อนุมัติ pinned panel: collapsible red board while any expired
 * member's latest renewal is REJECTED, green all-clear board at zero. The
 * เหตุผล line is admin-only (PR 1's rejection_reason/rejected_at fields);
 * the audience switches the header copy and the row pill wording.
 */
export function RejectedRenewalPanel({ rejectedRows, isAdmin, expanded, onToggleExpanded }: RejectedRenewalPanelProps) {
	const count = rejectedRows.length
	const hasRejected = count > 0

	const title = isAdmin ? "ไม่อนุมัติ — ต้องติดตาม" : "ไม่อนุมัติ — กรุณาติดต่อเจ้าหน้าที่"
	const subtitle = hasRejected
		? isAdmin
			? "คำขอต่ออายุที่ถูกไม่อนุมัติ ต้องติดต่อสมาชิกเพื่อดำเนินการใหม่"
			: "สมาชิกที่คำขอต่ออายุถูกไม่อนุมัติ กรุณาติดต่อฝ่ายข้อมูลและทะเบียนสมาชิก"
		: isAdmin
			? "จัดการคำขอทั้งหมดแล้ว"
			: "สถานะการต่ออายุของสมาชิกทุกท่านเป็นปกติ"

	return (
		<section data-slot="rejected-renewal-panel" className={cn("bg-card overflow-hidden rounded-2xl border", hasRejected ? "border-destructive/30" : "border-success/30")}>
			<button
				type="button"
				data-slot="rejected-renewal-panel-header"
				onClick={hasRejected ? onToggleExpanded : undefined}
				disabled={!hasRejected}
				aria-expanded={hasRejected ? expanded : undefined}
				className={cn("flex w-full items-center gap-3 p-4 text-left", hasRejected ? "bg-destructive/5 hover:bg-destructive/10" : "bg-success/5")}
			>
				<span
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-full",
						hasRejected ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
					)}
				>
					<HugeiconsIcon icon={hasRejected ? Alert02Icon : CheckmarkCircle01Icon} className="size-5" />
				</span>
				<span className="min-w-0 flex-1">
					<span className={cn("block font-semibold", hasRejected ? "text-destructive" : "text-success")}>{title}</span>
					<span className="text-muted-foreground block text-sm">{subtitle}</span>
				</span>
				<span
					className={cn(
						"rounded-full border px-2.5 py-0.5 text-xs font-medium",
						hasRejected ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"
					)}
				>
					{count} ราย
				</span>
				{hasRejected &&
					(expanded ? (
						<HugeiconsIcon icon={ArrowUp01Icon} className="text-muted-foreground size-4 shrink-0" />
					) : (
						<HugeiconsIcon icon={ArrowDown01Icon} className="text-muted-foreground size-4 shrink-0" />
					))}
			</button>

			{hasRejected && expanded && (
				<div data-slot="rejected-renewal-rows" className="border-destructive/20 divide-y border-t">
					{rejectedRows.map((member) => (
						<div key={member.id} data-slot="rejected-renewal-row" className="hover:bg-destructive/5 flex flex-col gap-2 p-4 md:flex-row md:items-center md:gap-4">
							<Avatar className="size-10 shrink-0">
								{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
								<AvatarFallback>{member.first_name_th.charAt(0)}</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-semibold">
										{fullNameTh(member)}
										{member.nickname !== "" && <span className="text-muted-foreground font-normal"> ({member.nickname})</span>}
									</span>
									<RenewalStatusBadge status="REJECTED" isAdmin={isAdmin} />
								</div>
								<div className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
									<HugeiconsIcon icon={Calendar01Icon} className="size-3.5" />
									<span>{member.rejected_at === null ? "-" : formatThaiDate(member.rejected_at)}</span>
								</div>
								{isAdmin && (
									<div className="mt-1 text-sm">
										<span className="text-muted-foreground">เหตุผล: </span>
										<span className="text-destructive">{member.rejection_reason ?? "-"}</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	)
}
