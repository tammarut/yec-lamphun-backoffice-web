"use client"

import { useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { useRouter } from "next/navigation"

import { ContactCard } from "src/modules/dashboard/components/contact-card"
import { MemberGrowthChart } from "src/modules/dashboard/components/member-growth-chart"
import { StatCards } from "src/modules/dashboard/components/stat-cards"
import { DASHBOARD_STAT_QUERY_KEY, useDashboardStat } from "src/modules/dashboard/hooks/use-dashboard-stat"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Card } from "src/shared/components/ui/card"
import { Skeleton } from "src/shared/components/ui/skeleton"

/**
 * /dashboard page content (card 01). ONE public query — the Dashboard Stat —
 * drives every region, so the whole view shares a single state: skeleton
 * while pending, destructive alert with รีเฟรช on error, full render on
 * success. State derives from isPending/isError flags only (TanStack v5
 * keeps last-good data on a failed refetch — truthy-data checks would lie).
 * The chart is strictly read-only: the mockup's admin edit modal has no
 * write API (README §8 item 2).
 */
export function DashboardView() {
	const stat = useDashboardStat()
	const queryClient = useQueryClient()
	const router = useRouter()

	const goToMembers = () => {
		router.push("/members")
	}

	return (
		<div data-slot="dashboard-view" className="space-y-6">
			<h1 className="text-2xl font-bold">ภาพรวม (Dashboard)</h1>

			{stat.isError ? (
				<Alert variant="destructive">
					<AlertTitle>โหลดข้อมูลแดชบอร์ดไม่สำเร็จ</AlertTitle>
					<AlertDescription className="flex items-center gap-3">
						<span>{stat.error.message}</span>
						<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: DASHBOARD_STAT_QUERY_KEY })}>
							<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
							รีเฟรช
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<>
					<StatCards data={stat.data} isPending={stat.isPending} />

					{stat.isPending ? (
						<>
							<Skeleton className="h-28 w-full rounded-2xl" />
							<div className="grid gap-6 lg:grid-cols-3">
								<Card className="lg:col-span-2">
									<Skeleton className="h-[300px] w-full rounded-xl" />
								</Card>
								<Card>
									<Skeleton className="h-[300px] w-full rounded-xl" />
								</Card>
							</div>
						</>
					) : (
						<>
							<section
								data-slot="member-search-banner"
								className="bg-chart-1/10 border-chart-1/20 flex flex-col items-center justify-between gap-6 rounded-2xl border p-6 md:flex-row"
							>
								<div className="flex items-center gap-5">
									<div className="bg-background text-chart-1 flex size-16 shrink-0 items-center justify-center rounded-full border">
										<HugeiconsIcon icon={Search01Icon} className="size-7" />
									</div>
									<div>
										<h2 className="text-xl font-bold">ตรวจสอบสมาชิก</h2>
										<p className="text-muted-foreground mt-1">ค้นหาข้อมูลธุรกิจ เบอร์โทรศัพท์ หรือสถานะของสมาชิก YEC ได้อย่างรวดเร็ว</p>
									</div>
								</div>
								<Button onClick={goToMembers} size="lg" className="whitespace-nowrap">
									<HugeiconsIcon icon={Search01Icon} className="size-4" />
									ค้นหาสมาชิก
								</Button>
							</section>

							<div className="grid gap-6 lg:grid-cols-3">
								<div className="lg:col-span-2">
									<MemberGrowthChart yearly={stat.data.total_members_each_year} />
								</div>
								<ContactCard />
							</div>
						</>
					)}
				</>
			)}
		</div>
	)
}
