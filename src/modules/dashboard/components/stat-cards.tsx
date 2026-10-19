"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { Building01Icon, Time04Icon, UserCheckIcon, UserGroupIcon } from "@hugeicons/core-free-icons"

import type { DashboardStatResponse } from "src/modules/dashboard/use-case/get-dashboard-stat/get-dashboard-stat.types"
import { Card } from "src/shared/components/ui/card"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { cn } from "src/shared/lib/utils/utils"

type StatCardSpec = {
	label: string
	countKey: "total_members" | "total_businesses" | "total_active_members" | "total_expired_members"
	icon: IconSvgElement
	/** Icon-tile tint, mapped from the mockup's colors onto semantic tokens: blue → primary, indigo → chart-5, green → success, orange → warning. */
	tintClass: string
}

const STAT_CARDS: readonly StatCardSpec[] = [
	{ label: "สมาชิกทั้งหมด", countKey: "total_members", icon: UserGroupIcon, tintClass: "bg-primary/15 text-primary" },
	{ label: "จำนวนกิจการ", countKey: "total_businesses", icon: Building01Icon, tintClass: "bg-chart-5/15 text-chart-5" },
	{ label: "สมาชิก Active", countKey: "total_active_members", icon: UserCheckIcon, tintClass: "bg-success/15 text-success" },
	{ label: "ยังไม่ได้ต่ออายุ", countKey: "total_expired_members", icon: Time04Icon, tintClass: "bg-warning/15 text-warning" },
]

type StatCardsProps = {
	data: DashboardStatResponse | undefined
	isPending: boolean
}

/**
 * The four headline KPI cards (mockup row) — the API's fifth count,
 * `total_members_each_year`, is the chart's data, so all five Dashboard Stat
 * counts land on the page. While pending each value renders as a skeleton;
 * `total_expired_members` is the ADR-0019 "ยังไม่ได้ต่ออายุ" reading
 * (EXPIRED or PENDING_RENEWAL) — deliberately not the Renewal Stat's count.
 */
export function StatCards({ data, isPending }: StatCardsProps) {
	return (
		<div data-slot="dashboard-stat-cards" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			{STAT_CARDS.map((card) => (
				<Card key={card.countKey} data-slot="dashboard-stat-card" data-count-key={card.countKey} className="flex items-center gap-4 p-6">
					<div className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl", card.tintClass)}>
						<HugeiconsIcon icon={card.icon} className="size-6" />
					</div>
					<div className="min-w-0">
						<p className="text-muted-foreground truncate text-xs">{card.label}</p>
						{isPending ? <Skeleton className="mt-1 h-8 w-12" /> : <p className="text-2xl font-bold">{data?.[card.countKey] ?? 0}</p>}
					</div>
				</Card>
			))}
		</div>
	)
}
