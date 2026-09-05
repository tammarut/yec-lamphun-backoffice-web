"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download02Icon, Grid02Icon, Menu01Icon, Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import { BulkActionsBar } from "src/shared/components/members/bulk-actions-bar"
import { DeleteMemberDialog } from "src/shared/components/members/delete-member-dialog"
import { MembersCardGrid } from "src/shared/components/members/members-card-grid"
import { MembersTable } from "src/shared/components/members/members-table"
import { downloadMembersCsv } from "src/shared/components/members/export-members-csv"
import type { MemberListItem } from "src/shared/components/members/members-types"
import { useDeleteMember, useMembers } from "src/shared/components/members/use-members"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Input } from "src/shared/components/ui/input"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { useDebouncedValue } from "src/shared/hooks/use-debounced-value"
import { useIsMobile } from "src/shared/hooks/use-mobile"
import { useSession } from "src/shared/lib/api/session"

const SEARCH_DEBOUNCE_MS = 300

type ViewMode = "list" | "card"

/** Member directory page content: toolbar, bulk bar, list/card views, load-more. */
export function MembersView() {
	const { isAdmin } = useSession()
	const isMobile = useIsMobile()

	const [searchTerm, setSearchTerm] = useState("")
	const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
	const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null)

	// The view is DERIVED: the user's explicit pick wins; otherwise follow the
	// breakpoint (card under 768px, table above). Deriving — rather than copying
	// isMobile into state — means useIsMobile()'s post-mount resolution flips
	// the default without an effect, and never fights the user's choice.
	const [userView, setUserView] = useState<ViewMode | null>(null)
	const viewMode: ViewMode = userView ?? (isMobile ? "card" : "list")
	const changeViewMode = (mode: ViewMode) => {
		setUserView(mode)
	}

	const membersQuery = useMembers(debouncedSearch)
	const deleteMutation = useDeleteMember()

	const members = useMemo(() => membersQuery.data?.pages.flatMap((page) => page.data) ?? [], [membersQuery.data])
	const lastPage = membersQuery.data?.pages.at(-1)
	const hasMore = lastPage?.has_more ?? false

	const toggleOne = (id: number, checked: boolean) => {
		setSelectedIds((previous) => {
			const next = new Set(previous)
			if (checked) {
				next.add(id)
			} else {
				next.delete(id)
			}
			return next
		})
	}

	const toggleAll = (checked: boolean) => {
		setSelectedIds(checked ? new Set(members.map((member) => member.id)) : new Set())
	}

	const handleExport = () => {
		// Selected rows when any, otherwise everything loaded so far (card).
		const rows = [...members].filter((member) => selectedIds.has(member.id))
		downloadMembersCsv(rows.length > 0 ? rows : members)
	}

	const handleConfirmDelete = () => {
		if (deleteTarget === null) return
		deleteMutation.mutate(deleteTarget.id, {
			onSuccess: () => {
				toast.success("ลบสมาชิกเรียบร้อย")
				setSelectedIds((previous) => {
					const next = new Set(previous)
					next.delete(deleteTarget.id)
					return next
				})
				setDeleteTarget(null)
			},
			onError: (error) => {
				toast.error(error.message)
			},
		})
	}

	const isLoading = membersQuery.isPending
	const isLoadingMore = membersQuery.isFetchingNextPage

	return (
		<div data-slot="members-view" className="space-y-6">
			{/* Toolbar: heading + search + view toggle (เพิ่มสมาชิก lands with the 3b wizard) */}
			<div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
				<h1 className="text-2xl font-bold">รายชื่อสมาชิก</h1>
				<div className="flex w-full gap-3 md:w-auto">
					<div className="relative flex-1 md:w-64">
						<HugeiconsIcon icon={Search01Icon} className="text-muted-foreground pointer-events-none absolute top-2.5 left-3 size-4" />
						<Input
							type="search"
							placeholder="ค้นหาชื่อจริง, เบอร์โทร หรือรหัสตำแหน่ง..."
							className="pl-9"
							aria-label="ค้นหาสมาชิก"
							title="ค้นแบบขึ้นต้นคำ — ชื่อจริง (ไทย), เบอร์โทร หรือรหัสตำแหน่ง เช่น PRESIDENT"
							value={searchTerm}
							onChange={(event) => setSearchTerm(event.target.value)}
						/>
					</div>
					<div className="bg-card flex rounded-lg border p-1" role="group" aria-label="มุมมองข้อมูล">
						<Button
							variant={viewMode === "list" ? "secondary" : "ghost"}
							size="icon-sm"
							aria-label="มุมมองตาราง"
							aria-pressed={viewMode === "list"}
							onClick={() => changeViewMode("list")}
						>
							<HugeiconsIcon icon={Menu01Icon} className="size-4" />
						</Button>
						<Button
							variant={viewMode === "card" ? "secondary" : "ghost"}
							size="icon-sm"
							aria-label="มุมมองการ์ด"
							aria-pressed={viewMode === "card"}
							onClick={() => changeViewMode("card")}
						>
							<HugeiconsIcon icon={Grid02Icon} className="size-4" />
						</Button>
					</div>
					{isAdmin && (
						<Button variant="outline" onClick={handleExport} data-slot="export-csv">
							<HugeiconsIcon icon={Download02Icon} className="size-4" />
							Export CSV
						</Button>
					)}
				</div>
			</div>

			{isAdmin && selectedIds.size > 0 && <BulkActionsBar count={selectedIds.size} />}

			{isLoading ? (
				viewMode === "list" ? (
					<div data-slot="members-table-skeleton" className="bg-card space-y-2 rounded-xl border p-4">
						{Array.from({ length: 5 }, (_, index) => (
							<div key={index} className="flex items-center gap-4">
								<Skeleton className="size-12 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-1/3" />
									<Skeleton className="h-3 w-1/4" />
								</div>
								<Skeleton className="hidden h-4 w-1/5 md:block" />
								<Skeleton className="hidden h-4 w-1/6 md:block" />
							</div>
						))}
					</div>
				) : (
					<div data-slot="members-cards-skeleton" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{Array.from({ length: 8 }, (_, index) => (
							<Skeleton key={index} className="h-64 rounded-xl" />
						))}
					</div>
				)
			) : membersQuery.isError ? (
				<Alert variant="destructive">
					<AlertTitle>โหลดรายชื่อสมาชิกไม่สำเร็จ</AlertTitle>
					<AlertDescription className="flex items-center gap-3">
						<span>{membersQuery.error.message}</span>
						<Button variant="outline" size="sm" onClick={() => membersQuery.refetch()}>
							<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
							ลองใหม่
						</Button>
					</AlertDescription>
				</Alert>
			) : members.length === 0 ? (
				<div className="rounded-2xl border border-dashed py-12 text-center">
					<p className="text-muted-foreground">ไม่พบข้อมูลสมาชิก</p>
				</div>
			) : viewMode === "list" ? (
				<MembersTable members={members} isAdmin={isAdmin} selectedIds={selectedIds} onToggleOne={toggleOne} onToggleAll={toggleAll} onDeleteClick={setDeleteTarget} />
			) : (
				<MembersCardGrid members={members} isAdmin={isAdmin} onDeleteClick={setDeleteTarget} />
			)}

			{!isLoading && hasMore && (
				<div className="flex justify-center">
					<Button variant="outline" disabled={isLoadingMore} onClick={() => membersQuery.fetchNextPage()} data-slot="load-more">
						{isLoadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
					</Button>
				</div>
			)}

			<DeleteMemberDialog
				member={deleteTarget}
				isDeleting={deleteMutation.isPending}
				onOpenChange={(open) => {
					if (!open && !deleteMutation.isPending) {
						setDeleteTarget(null)
					}
				}}
				onConfirm={handleConfirmDelete}
			/>
		</div>
	)
}
