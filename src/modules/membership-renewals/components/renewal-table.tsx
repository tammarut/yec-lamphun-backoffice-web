"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircleIcon, Refresh01Icon, Search01Icon, ViewIcon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { fullNameTh, positionLabel } from "src/modules/membership-renewals/components/renewal-labels"
import { RenewalStatusBadge } from "src/modules/membership-renewals/components/renewal-status-badge"
import { SlipViewerDialog, type SlipViewerMember } from "src/modules/membership-renewals/components/slip-viewer-dialog"
import { MEMBERSHIP_RENEWALS_LIST_QUERY_KEY, useMembershipRenewals } from "src/modules/membership-renewals/hooks/use-membership-renewals"
import type { ListableRenewalStatus, MembershipRenewalResponse } from "src/modules/membership-renewals/use-case/get-list-membership-renewal/get-list-membership-renewal.types"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Input } from "src/shared/components/ui/input"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/shared/components/ui/table"
import { useDebouncedValue } from "src/shared/hooks/use-debounced-value"
import { useSession } from "src/shared/lib/api/session"

const SEARCH_DEBOUNCE_MS = 300

type RenewalTableProps = {
	/** Which listable Renewal Status tab this table shows (รอตรวจสอบ / ปกติ). */
	status: ListableRenewalStatus
}

/** Row display name reused for the eye action's aria-label and the dialog header. */
function rowDisplayName(row: MembershipRenewalResponse): string {
	const nicknameSuffix = row.nickname !== "" ? ` (${row.nickname})` : ""
	return `${fullNameTh(row)}${nicknameSuffix}`
}

/**
 * รอตรวจสอบ/ปกติ single table (mockup v3) behind the stat cards: server-side
 * debounced search + cursor load-more copied from the PR 2 worklist hook, the
 * admin-only วันที่ทำรายการ + ดำเนินการ columns gated by session. The approved
 * row's eye action opens the slip viewer; the ตรวจสอบ/อนุมัติ review button is
 * PR 3 — pending rows show a placeholder dash.
 */
export function RenewalTable({ status }: RenewalTableProps) {
	const { isAdmin } = useSession()

	const [searchTerm, setSearchTerm] = useState("")
	const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)

	const [activeSlipMember, setActiveSlipMember] = useState<SlipViewerMember | null>(null)

	const queryClient = useQueryClient()
	const query = useMembershipRenewals(status, debouncedSearch)

	const rows = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data])

	const lastPage = query.data?.pages.at(-1)
	const hasMore = lastPage?.has_more ?? false
	const columnCount = isAdmin ? 6 : 4

	return (
		<section data-slot="renewal-table" className="bg-card overflow-hidden rounded-2xl border">
			<div className="border-b p-4">
				<div className="relative w-full md:w-80">
					<HugeiconsIcon icon={Search01Icon} className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
					<Input
						type="search"
						placeholder="ค้นหาชื่อ หรือ เบอร์โทรศัพท์..."
						className="pl-9"
						aria-label="ค้นหาสมาชิกในตาราง"
						title="ค้นหาเมื่อชื่อจริง (ไทย) หรือเบอร์โทรศัพท์มีคำนั้นอยู่ — เช่นพิมพ์เบอร์บางส่วนก็ได้"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>
			</div>

			{query.isPending ? (
				<div data-slot="renewal-table-skeleton" className="space-y-3 p-4">
					{Array.from({ length: 3 }, (_, index) => (
						<div key={index} className="flex items-center gap-4">
							<Skeleton className="size-10 rounded-full" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-1/3" />
								<Skeleton className="h-3 w-1/4" />
							</div>
						</div>
					))}
				</div>
			) : query.isError ? (
				<div className="p-4">
					<Alert variant="destructive">
						<AlertTitle>โหลดรายการต่ออายุไม่สำเร็จ</AlertTitle>
						<AlertDescription className="flex items-center gap-3">
							<span>{query.error.message}</span>
							<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: MEMBERSHIP_RENEWALS_LIST_QUERY_KEY })}>
								<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
								ลองใหม่
							</Button>
						</AlertDescription>
					</Alert>
				</div>
			) : (
				<>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/50">
									<TableHead>สมาชิก</TableHead>
									<TableHead>ประเภท</TableHead>
									<TableHead>วันที่เป็นสมาชิก</TableHead>
									{isAdmin && <TableHead>วันที่ทำรายการ</TableHead>}
									<TableHead>สถานะ</TableHead>
									{isAdmin && <TableHead className="text-right">ดำเนินการ</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.renewal_id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<Avatar className="size-10 shrink-0">
													{row.profile_avatar !== null && <AvatarImage src={row.profile_avatar} alt={fullNameTh(row)} />}
													<AvatarFallback>{row.first_name_th.charAt(0)}</AvatarFallback>
												</Avatar>
												<div className="min-w-0">
													<div className="font-medium">
														{fullNameTh(row)}
														{row.nickname !== "" && <span className="text-muted-foreground font-normal"> ({row.nickname})</span>}
													</div>
													<div className="text-muted-foreground text-sm">{row.phone_no}</div>
												</div>
											</div>
										</TableCell>
										<TableCell className="text-sm">{positionLabel(row.position)}</TableCell>
										<TableCell className="text-sm">{formatThaiDate(row.member_since)}</TableCell>
										{isAdmin && <TableCell className="text-sm">{formatThaiDate(row.payment_date_at)}</TableCell>}
										<TableCell>
											<RenewalStatusBadge status={row.status} isAdmin={isAdmin} />
										</TableCell>
										{isAdmin && (
											<TableCell className="text-right">
												{row.status === "APPROVED" ? (
													<div className="flex items-center justify-end gap-2">
														<span className="text-success inline-flex items-center gap-1 text-xs font-semibold">
															<HugeiconsIcon icon={CheckmarkCircleIcon} className="size-3.5" />
															เรียบร้อย
														</span>
														<Button
															variant="outline"
															size="icon-sm"
															data-slot="slip-eye"
															aria-label={`ดูสลิปการโอนเงินของ ${rowDisplayName(row)}`}
															title="ดูสลิปการโอนเงิน"
															onClick={() =>
																setActiveSlipMember({
																	id: row.id,
																	name: rowDisplayName(row),
																})
															}
														>
															<HugeiconsIcon icon={ViewIcon} className="size-4" />
														</Button>
													</div>
												) : (
													// Placeholder until PR 3 wires the ตรวจสอบ/อนุมัติ review action.
													<span className="text-muted-foreground text-xs">-</span>
												)}
											</TableCell>
										)}
									</TableRow>
								))}
								{rows.length === 0 && (
									<TableRow>
										<TableCell colSpan={columnCount} className="text-muted-foreground py-8 text-center">
											ไม่พบข้อมูล
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					{hasMore && (
						<div className="flex justify-center border-t p-3">
							<Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} data-slot="load-more">
								{query.isFetchingNextPage ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
							</Button>
						</div>
					)}
				</>
			)}

			<SlipViewerDialog member={activeSlipMember} onClose={() => setActiveSlipMember(null)} />
		</section>
	)
}
