import { DashboardLayout } from "src/shared/components/layout/dashboard-layout"
import { Card, CardHeader, CardTitle, CardContent } from "src/shared/components/ui/card"
import { Button } from "src/shared/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import {
	UserGroupIcon,
	Building01Icon,
	UserCheck01Icon,
	Time02Icon,
	Search01Icon,
	PresentationLineChart01Icon,
	Facebook01Icon,
	Location01Icon,
	TelephoneIcon,
	Message01Icon,
	AiSearch02Icon
} from "@hugeicons/core-free-icons"

export default function Page() {
	return (
		<DashboardLayout>
			<div className="space-y-6">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">ภาพรวม (Dashboard)</h2>
				</div>

				{/* Stats Row */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">สมาชิกทั้งหมด</CardTitle>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
								<HugeiconsIcon icon={UserGroupIcon} size={20} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">10</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">จำนวนกิจการ</CardTitle>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
								<HugeiconsIcon icon={Building01Icon} size={20} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">10</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">สมาชิก Active</CardTitle>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
								<HugeiconsIcon icon={UserCheck01Icon} size={20} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">9</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">ยังไม่ได้ต่ออายุ</CardTitle>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground shadow-sm">
								<HugeiconsIcon icon={Time02Icon} size={20} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">1</div>
						</CardContent>
					</Card>
				</div>

				{/* Search Banner */}
				<div className="flex flex-col items-center justify-between gap-6 rounded-2xl border bg-card p-6 shadow-sm md:flex-row">
					<div className="flex items-center gap-5">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary shadow-sm">
							<HugeiconsIcon icon={AiSearch02Icon} size={28} />
						</div>
						<div>
							<h3 className="text-xl font-bold text-foreground">ตรวจสอบสมาชิก</h3>
							<p className="mt-1 text-muted-foreground">ค้นหาข้อมูลธุรกิจ เบอร์โทรศัพท์ หรือสถานะของสมาชิก YEC ได้อย่างรวดเร็ว</p>
						</div>
					</div>
					<Button className="whitespace-nowrap px-8 py-6 text-base font-bold shadow-md transition-transform hover:-translate-y-0.5">
						<HugeiconsIcon icon={Search01Icon} size={20} className="mr-2" />
						ค้นหาสมาชิก
					</Button>
				</div>

				{/* Chart Area Mock */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between pb-2">
						<CardTitle className="flex items-center gap-2 text-lg">
							<HugeiconsIcon icon={PresentationLineChart01Icon} size={24} className="text-primary" />
							จำนวนสมาชิกในแต่ละปี (ย้อนหลัง 5 ปี)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed bg-muted/30">
							<p className="text-muted-foreground">Chart Area Mockup</p>
						</div>
					</CardContent>
				</Card>

				{/* Contact Channels */}
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="flex items-center gap-2 text-lg">
							<HugeiconsIcon icon={Message01Icon} size={24} className="text-primary" />
							ช่องทางการติดต่อ
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="flex flex-col justify-center">
							<div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
								{/* Facebook Card */}
								<a href="https://www.facebook.com/yeclamphun" target="_blank" rel="noopener noreferrer" className="group flex cursor-pointer items-center gap-4 rounded-2xl border bg-muted/50 p-5 transition hover:border-primary/50 hover:shadow-md">
									<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl text-primary shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:scale-110">
										<HugeiconsIcon icon={Facebook01Icon} size={32} />
									</div>
									<div>
										<h4 className="mb-1 text-lg font-bold text-foreground">Facebook Page</h4>
										<p className="text-sm font-medium text-primary">YEC Lamphun</p>
										<span className="mt-1 block text-xs text-muted-foreground">ติดตามข่าวสารและกิจกรรม</span>
									</div>
								</a>

								{/* LINE Card */}
								<a href="#" className="group flex cursor-pointer items-center gap-4 rounded-2xl border bg-muted/50 p-5 transition hover:border-primary/50 hover:shadow-md">
									<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl text-primary shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:scale-110">
										{/* Line Icon mock using Message */}
										<HugeiconsIcon icon={Message01Icon} size={32} />
									</div>
									<div>
										<h4 className="mb-1 text-lg font-bold text-foreground">LINE Official</h4>
										<p className="text-sm font-medium text-primary">@yeclamphun</p>
										<span className="mt-1 block text-xs text-muted-foreground">ติดต่อสอบถามข้อมูล</span>
									</div>
								</a>
							</div>

							<div className="flex flex-col items-center justify-center gap-6 rounded-xl border bg-muted p-4 text-sm text-muted-foreground md:flex-row">
								<div className="flex items-center gap-2">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-primary shadow-sm">
										<HugeiconsIcon icon={Location01Icon} size={16} />
									</div>
									<span>สำนักงานหอการค้าจังหวัดลำพูน</span>
								</div>
								<div className="hidden h-8 w-px bg-border md:block"></div>
								<div className="flex items-center gap-2">
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
										<HugeiconsIcon icon={TelephoneIcon} size={16} />
									</div>
									<span>053-510-686</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

			</div>
		</DashboardLayout>
	)
}
