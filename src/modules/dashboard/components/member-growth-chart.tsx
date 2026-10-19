"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { ChartLineData01Icon } from "@hugeicons/core-free-icons"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "src/shared/components/ui/chart"

export type YearlyPoint = {
	year: string
	count: number
}

/**
 * `total_members_each_year` → ascending chart points. The API zero-fills the
 * whole lookback window and serializes integer-like keys ascending (ADR-0019),
 * but the sort is kept defensive — the chart reads top-to-bottom left-to-right.
 */
export function toYearlyPoints(yearly: Readonly<Record<string, number>>): YearlyPoint[] {
	return Object.entries(yearly)
		.map(([year, count]) => ({ year, count }))
		.sort((a, b) => Number(a.year) - Number(b.year))
}

const CHART_CONFIG = {
	count: { label: "จำนวนสมาชิก", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Members-joined-per-year area chart (mockup look: line + soft fill). The API
 * returns PER-YEAR joined counts, so that is what is plotted — the mockup's
 * series was internally cumulative ("จำนวนสมาชิกสะสม"), and the API wins.
 * X labels are the raw Christian year keys (user decision 2026-10-19 — no
 * Buddhist-Era conversion). All-zero data renders the muted ไม่มีข้อมูล
 * placeholder instead of a flat line.
 */
export function MemberGrowthChart({ yearly }: { yearly: Readonly<Record<string, number>> }) {
	const points = toYearlyPoints(yearly)
	const isEmpty = points.every((point) => point.count === 0)

	return (
		<Card data-slot="member-growth-chart">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<HugeiconsIcon icon={ChartLineData01Icon} className="text-chart-1 size-5" />
					จำนวนสมาชิกในแต่ละปี (ย้อนหลัง 5 ปี)
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isEmpty ? (
					<div data-slot="member-growth-chart-empty" className="text-muted-foreground flex h-[300px] items-center justify-center rounded-xl border border-dashed text-sm">
						ไม่มีข้อมูล
					</div>
				) : (
					// aspect-auto cancels the container's default aspect-video (same
					// tailwind-merge group) — the fixed height stays the only sizing rule.
					<ChartContainer config={CHART_CONFIG} className="aspect-auto h-[300px] w-full">
						<AreaChart data={points} margin={{ left: 8, right: 8 }}>
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
							<YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
							<ChartTooltip cursor={{ stroke: "var(--color-count)" }} content={<ChartTooltipContent hideIndicator />} />
							<Area dataKey="count" type="monotone" stroke="var(--color-count)" fill="var(--color-count)" fillOpacity={0.15} strokeWidth={2} />
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	)
}
