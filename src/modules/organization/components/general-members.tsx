"use client"

import { useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon, UserGroupIcon } from "@hugeicons/core-free-icons"

import { fullNameTh } from "src/modules/organization/components/person-card"
import { ORGANIZATION_MEMBERS_QUERY_KEY, useOrganizationMembers } from "src/modules/organization/hooks/use-organization-members"
import type { MemberStatus } from "src/modules/members/use-case/get-list-members/get-list-members.types"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/shared/components/ui/card"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { cn } from "src/shared/lib/utils/utils"

/**
 * 3-color status dot (card-02 amendment ruling 4): green ACTIVE / amber
 * PENDING_RENEWAL / gray EXPIRED on semantic theme tokens. RESIGNED never
 * reaches this page (the server filters it) — gray covers EXPIRED.
 */
function statusDotClass(status: MemberStatus): string {
	if (status === "ACTIVE") {
		return "bg-success"
	}
	if (status === "PENDING_RENEWAL") {
		return "bg-pending"
	}
	return "bg-muted-foreground"
}

/**
 * Thai status names for the dot's accessible label (scrutiny F1, WCAG
 * 1.4.1 — color alone must not carry the status). House vocabulary: ปกติ /
 * ยังไม่ได้ต่ออายุ from the members STATUS_BADGES map, หมดอายุ from the
 * renewals expired table — the dot distinguishes all three, so the text
 * must too (unlike STATUS_BADGES, which merges EXPIRED and PENDING_RENEWAL).
 */
function statusText(status: MemberStatus): string {
	if (status === "ACTIVE") {
		return "ปกติ"
	}
	if (status === "PENDING_RENEWAL") {
		return "ยังไม่ได้ต่ออายุ"
	}
	return "หมดอายุ"
}

/**
 * สมาชิกทั่วไป (General Members) — the second /organization section: a
 * responsive chip grid of GENERAL_MEMBER holders with live statuses only,
 * driven by its own cursor-accumulating query. No count badge (the keyset
 * response carries no total; โหลดเพิ่มเติม already communicates "more").
 */
export function GeneralMembers() {
	const membersQuery = useOrganizationMembers()
	const queryClient = useQueryClient()

	const members = useMemo(() => membersQuery.data?.pages.flatMap((page) => page.data) ?? [], [membersQuery.data])
	const lastPage = membersQuery.data?.pages.at(-1)
	const hasMore = lastPage?.has_more ?? false
	const isLoadingMore = membersQuery.isFetchingNextPage

	return (
		<Card data-slot="general-members-section" className="gap-0">
			<CardHeader className="border-b [.border-b]:pb-4">
				<div className="flex items-center gap-3">
					<div className="bg-warning/10 text-warning flex size-9 items-center justify-center rounded-lg">
						<HugeiconsIcon icon={UserGroupIcon} className="size-5" />
					</div>
					<div>
						<CardTitle className="text-xl font-bold">สมาชิกทั่วไป (General Members)</CardTitle>
						<CardDescription>รายชื่อสมาชิกที่ไม่ได้ดำรงตำแหน่งในคณะกรรมการ</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-4">
				{membersQuery.isPending ? (
					<div data-slot="general-members-skeleton" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{Array.from({ length: 10 }, (_, index) => (
							<Skeleton key={index} className="h-16 rounded-xl" />
						))}
					</div>
				) : membersQuery.isError ? (
					<Alert variant="destructive">
						<AlertTitle>โหลดรายชื่อสมาชิกทั่วไปไม่สำเร็จ</AlertTitle>
						<AlertDescription className="flex items-center gap-3">
							<span>{membersQuery.error.message}</span>
							<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: ORGANIZATION_MEMBERS_QUERY_KEY })}>
								<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
								ลองใหม่
							</Button>
						</AlertDescription>
					</Alert>
				) : members.length === 0 ? (
					<div data-slot="general-members-empty" className="bg-muted/30 border-border/60 rounded-xl border border-dashed py-10 text-center">
						<p className="text-muted-foreground">ไม่มีข้อมูลสมาชิกทั่วไป</p>
					</div>
				) : (
					<>
						<div data-slot="general-members-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
							{members.map((member) => (
								<div key={member.id} data-slot="general-member-chip" className="hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-4 transition-colors">
									<div className="relative shrink-0">
										<Avatar className="size-12">
											{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
											<AvatarFallback className="text-base">{member.first_name_th.charAt(0)}</AvatarFallback>
										</Avatar>
										<span
											data-slot="member-status-dot"
											data-status={member.status}
											role="img"
											aria-label={`สถานะ: ${statusText(member.status)}`}
											className={cn(
												"ring-background/60 border-background absolute right-0 bottom-0 size-3 rounded-full border-2",
												statusDotClass(member.status)
											)}
										/>
									</div>
									<div className="min-w-0">
										<div className="truncate text-sm font-bold">
											{fullNameTh(member)} {member.nickname !== "" && <span className="text-muted-foreground font-normal">({member.nickname})</span>}
										</div>
										<div className="text-muted-foreground truncate text-xs">{member.business.name}</div>
									</div>
								</div>
							))}
						</div>
						{hasMore && (
							<div className="flex justify-center pt-6">
								<Button variant="outline" disabled={isLoadingMore} onClick={() => membersQuery.fetchNextPage()} data-slot="load-more">
									{isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
								</Button>
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	)
}
