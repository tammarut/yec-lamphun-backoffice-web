"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { RENEWAL_STAT_QUERY_KEY, useRenewalStat } from "src/modules/membership-renewals/hooks/use-renewal-stat"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Skeleton } from "src/shared/components/ui/skeleton"

/** Which area of the page the stat cards filter. `NOT_RENEWED` renders the PR 2 worklist. */
export const RENEWAL_FILTERS = ["NOT_RENEWED", "PENDING_REVIEW", "APPROVED"] as const
export type RenewalFilter = (typeof RENEWAL_FILTERS)[number]

type StatCardSpec = {
	filter: RenewalFilter
	label: string
	countKey: "total_expired_members" | "total_pending_review_members" | "total_approved_members"
	/**
	 * Active-state tint, in the page's semantic status vocabulary (the mockup's
	 * orange-vs-yellow pair collapses to `warning` — no separate orange token).
	 */
	activeClass: string
	dotClass: string
}

const STAT_CARDS: readonly StatCardSpec[] = [
	{
		filter: "NOT_RENEWED",
		label: "ยังไม่ได้ต่ออายุ",
		countKey: "total_expired_members",
		activeClass: "bg-warning/15 text-warning",
		dotClass: "bg-warning",
	},
	{
		filter: "PENDING_REVIEW",
		label: "รอตรวจสอบการโอน",
		countKey: "total_pending_review_members",
		activeClass: "bg-warning/15 text-warning",
		dotClass: "bg-warning",
	},
	{
		filter: "APPROVED",
		label: "ปกติ (ต่ออายุแล้ว)",
		countKey: "total_approved_members",
		activeClass: "bg-success/15 text-success",
		dotClass: "bg-success",
	},
]

type RenewalStatsProps = {
	filter: RenewalFilter
	onSelect: (filter: RenewalFilter) => void
}

/**
 * The three clickable stat cards fed by GET /renewals/stat. The ยังไม่ได้ต่ออายุ
 * count (`total_expired_members`) is the ADR-0017 superset — the authoritative
 * number the PR 2 worklist deliberately does not badge. The counts are NOT a
 * partition (CONTEXT.md) and are display-only; while pending they render as a
 * skeleton and on error as "–", and the cards stay clickable either way (the
 * area below filters regardless).
 */
export function RenewalStats({ filter, onSelect }: RenewalStatsProps) {
	const stat = useRenewalStat()
	const queryClient = useQueryClient()

	if (stat.isError) {
		return (
			<Alert>
				<AlertTitle>โหลดจำนวนสรุปไม่สำเร็จ</AlertTitle>
				<AlertDescription className="flex items-center gap-3">
					<span>{stat.error.message}</span>
					<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: RENEWAL_STAT_QUERY_KEY })}>
						<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
						ลองใหม่
					</Button>
				</AlertDescription>
			</Alert>
		)
	}

	return (
		<div data-slot="renewal-stats" className="bg-card flex flex-wrap gap-1 rounded-2xl border p-1.5">
			{STAT_CARDS.map((card) => {
				const active = filter === card.filter
				const count = stat.data?.[card.countKey]
				return (
					<button
						key={card.filter}
						type="button"
						aria-pressed={active}
						data-slot="renewal-stat-card"
						data-status={card.filter}
						onClick={() => onSelect(card.filter)}
						className={`flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
							active ? card.activeClass : "text-muted-foreground hover:bg-muted hover:text-foreground"
						}`}
					>
						<span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${card.dotClass}`} />
						<span className="truncate">{card.label}</span>
						{stat.isPending ? (
							<Skeleton className="h-5 w-8 rounded-full" />
						) : (
							<span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${active ? card.activeClass : "bg-muted text-muted-foreground"}`}>
								{count ?? "–"}
							</span>
						)}
					</button>
				)
			})}
		</div>
	)
}
