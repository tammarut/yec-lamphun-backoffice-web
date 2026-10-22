"use client"

import { useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { HierarchySquare02Icon, Refresh01Icon } from "@hugeicons/core-free-icons"

import { GeneralMembers } from "src/modules/organization/components/general-members"
import { countFilledNodes, OrgTree } from "src/modules/organization/components/org-tree"
import { VacantPositionCard } from "src/modules/organization/components/person-card"
import { EXECUTIVE_COMMITTEE_QUERY_KEY, useExecutiveCommittee } from "src/modules/organization/hooks/use-executive-committee"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"
import { Skeleton } from "src/shared/components/ui/skeleton"

/**
 * /organization page content (card 02). Two independent queries — the
 * Executive Committee tree and the general-members grid — so each section
 * carries its own skeleton, error + retry, and empty state: one failing
 * query never blanks the other. State derives from isPending/isError flags
 * only (TanStack v5 keeps last-good data on a failed refetch).
 */
export function OrgChartView() {
	const committeeQuery = useExecutiveCommittee()
	const queryClient = useQueryClient()
	const tree = committeeQuery.data

	return (
		<div data-slot="org-chart-view" className="space-y-6">
			<h1 className="text-2xl font-bold">โครงสร้างองค์กร</h1>

			<Card data-slot="committee-section" className="gap-0">
				<CardHeader className="border-b [.border-b]:pb-4">
					<div className="flex items-center gap-3">
						<div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
							<HugeiconsIcon icon={HierarchySquare02Icon} className="size-5" />
						</div>
						<CardTitle className="text-xl font-bold">คณะกรรมการบริหาร (Executive Committee)</CardTitle>
					</div>
					{tree !== undefined && (
						<CardAction>
							<span data-slot="committee-count-badge" className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-bold">
								{tree === null ? 0 : countFilledNodes(tree)} คน
							</span>
						</CardAction>
					)}
				</CardHeader>
				<CardContent className="pt-4">
					{committeeQuery.isPending ? (
						<div data-slot="committee-skeleton" className="flex flex-col items-center gap-6">
							<Skeleton className="h-24 w-64 rounded-xl" />
							<div className="flex justify-center gap-8">
								{Array.from({ length: 4 }, (_, index) => (
									<Skeleton key={index} className="h-40 w-48 rounded-xl" />
								))}
							</div>
						</div>
					) : committeeQuery.isError ? (
						<Alert variant="destructive">
							<AlertTitle>โหลดโครงสร้างคณะกรรมการไม่สำเร็จ</AlertTitle>
							<AlertDescription className="flex items-center gap-3">
								<span>{committeeQuery.error.message}</span>
								<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: EXECUTIVE_COMMITTEE_QUERY_KEY })}>
									<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
									ลองใหม่
								</Button>
							</AlertDescription>
						</Alert>
					) : tree == null ? (
						<div className="flex justify-center py-4">
							<VacantPositionCard title="ยังไม่มีประธาน" variant="president" />
						</div>
					) : (
						<OrgTree root={tree} />
					)}
				</CardContent>
			</Card>

			<GeneralMembers />
		</div>
	)
}
