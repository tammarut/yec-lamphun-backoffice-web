"use client"

import { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Clock01Icon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { ExpiredMembersTable } from "src/modules/membership-renewals/components/expired-members-table"
import { RejectedRenewalPanel } from "src/modules/membership-renewals/components/rejected-renewal-panel"
import { EXPIRED_MEMBERSHIPS_QUERY_KEY, useExpiredMemberships } from "src/modules/membership-renewals/hooks/use-expired-memberships"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Input } from "src/shared/components/ui/input"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { useDebouncedValue } from "src/shared/hooks/use-debounced-value"
import { useSession } from "src/shared/lib/api/session"

const SEARCH_DEBOUNCE_MS = 300

/** How many หมดอายุ rows render before the mockup's +10 reveal button. */
const EXPIRED_SHOWN_STEP = 10

/**
 * ยังไม่ได้ต่ออายุ sectioned worklist (mockup v3 centerpiece). The expired
 * endpoint already orders rejected-renewal members first; the client splits
 * the accumulated pages on `latest_renewal_status` into the pinned ไม่อนุมัติ
 * panel and the หมดอายุ table (member_since column, +10 reveal paging).
 *
 * PR 2b composed this view under the renewal page's shared header (the page
 * h1 + admin toggle live in renewal-page-view.tsx now) alongside the stat
 * cards and the รอตรวจสอบ/ปกติ table; row actions arrive with PR 3's write
 * flows.
 */
export function RenewalWorklistView() {
	const { isAdmin } = useSession()

	const [searchTerm, setSearchTerm] = useState("")
	const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)
	const searching = debouncedSearch !== ""

	// The panel is DERIVED like the members view's mode: the user's collapse
	// wins, but a search re-expands so matches stay visible without a click.
	const [userExpanded, setUserExpanded] = useState(true)
	const panelExpanded = userExpanded || searching

	// The +10 reveal counter is keyed to the search term it was earned under:
	// a new (debounced) search term reads as the default count — the mockup's
	// "searching restarts the +10 paging" — without an effect. The keyset
	// pages themselves reset via the query key.
	const [revealState, setRevealState] = useState({ search: "", count: EXPIRED_SHOWN_STEP })
	const expiredShownCount = revealState.search === debouncedSearch ? revealState.count : EXPIRED_SHOWN_STEP
	const showMoreExpired = () => {
		setRevealState({ search: debouncedSearch, count: expiredShownCount + EXPIRED_SHOWN_STEP })
	}

	const queryClient = useQueryClient()
	const expiredQuery = useExpiredMemberships(debouncedSearch)

	const rows = useMemo(() => expiredQuery.data?.pages.flatMap((page) => page.data) ?? [], [expiredQuery.data])
	const rejectedRows = useMemo(() => rows.filter((row) => row.latest_renewal_status === "REJECTED"), [rows])
	const expiredRows = useMemo(() => rows.filter((row) => row.latest_renewal_status !== "REJECTED"), [rows])

	const lastPage = expiredQuery.data?.pages.at(-1)
	const hasMore = lastPage?.has_more ?? false
	const isLoading = expiredQuery.isPending
	const isLoadingMore = expiredQuery.isFetchingNextPage

	// While searching every accumulated match shows (paging hidden); otherwise
	// the reveal counter grows by +10 per click.
	const visibleExpiredRows = searching ? expiredRows : expiredRows.slice(0, expiredShownCount)
	const remainingExpiredRows = expiredRows.length - visibleExpiredRows.length

	return (
		<div data-slot="renewal-worklist-view" className="space-y-6">
			<div className="flex flex-col justify-between gap-4 md:flex-row md:items-center md:justify-end">
				<div className="relative w-full md:w-64">
					<HugeiconsIcon icon={Search01Icon} className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
					<Input
						type="search"
						placeholder="ค้นหาชื่อ หรือ เบอร์โทรศัพท์..."
						className="pl-9"
						aria-label="ค้นหาสมาชิกในรายการต่ออายุ"
						title="ค้นหาเมื่อชื่อจริง (ไทย) หรือเบอร์โทรศัพท์มีคำนั้นอยู่ — เช่นพิมพ์เบอร์บางส่วนก็ได้"
						value={searchTerm}
						onChange={(event) => setSearchTerm(event.target.value)}
					/>
				</div>
			</div>

			{isLoading ? (
				<div data-slot="renewal-worklist-skeleton" className="space-y-4">
					<div className="bg-card space-y-2 rounded-2xl border p-4">
						<div className="flex items-center gap-3">
							<Skeleton className="size-10 rounded-full" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-1/3" />
								<Skeleton className="h-3 w-1/2" />
							</div>
						</div>
					</div>
					<div className="bg-card space-y-2 rounded-xl border p-4">
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
				</div>
			) : expiredQuery.isError ? (
				<Alert variant="destructive">
					<AlertTitle>โหลดรายการต่ออายุไม่สำเร็จ</AlertTitle>
					<AlertDescription className="flex items-center gap-3">
						<span>{expiredQuery.error.message}</span>
						<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: EXPIRED_MEMBERSHIPS_QUERY_KEY })}>
							<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
							ลองใหม่
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<>
					<RejectedRenewalPanel
						rejectedRows={rejectedRows}
						isAdmin={isAdmin}
						expanded={panelExpanded}
						onToggleExpanded={() => setUserExpanded((previous) => !previous)}
					/>

					<section data-slot="expired-members-section" className="bg-card overflow-hidden rounded-2xl border">
						<div className="flex items-center gap-3 p-4">
							<span className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full">
								<HugeiconsIcon icon={Clock01Icon} className="size-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block font-semibold">หมดอายุ — ยังไม่แจ้งต่ออายุ</span>
								<span className="text-muted-foreground block text-sm">สมาชิกที่หมดอายุแล้วและยังไม่ได้แจ้งชำระเงิน (เรียงตามรหัสสมาชิก)</span>
							</span>
						</div>
						<div className="border-t p-4">
							<ExpiredMembersTable members={visibleExpiredRows} />
							{!searching && remainingExpiredRows > 0 && (
								<button
									type="button"
									data-slot="expired-show-more"
									onClick={showMoreExpired}
									className="text-destructive hover:bg-destructive/5 mt-3 flex w-full items-center justify-center gap-1 rounded-lg border-t pt-3 text-sm font-medium"
								>
									แสดงเพิ่มเติม (เหลืออีก {remainingExpiredRows} ราย)
									<HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
								</button>
							)}
						</div>
					</section>

					{hasMore && (
						<div className="flex justify-center">
							<Button variant="outline" disabled={isLoadingMore} onClick={() => expiredQuery.fetchNextPage()} data-slot="load-more">
								{isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	)
}
