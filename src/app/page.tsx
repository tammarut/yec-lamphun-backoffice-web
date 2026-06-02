import { DashboardLayout } from "src/shared/components/layout/dashboard-layout"
import { Card, CardHeader, CardTitle, CardContent } from "src/shared/components/ui/card"
import { Button } from "src/shared/components/ui/button"
import { ArrowUpRight01Icon, UserGroupIcon, StarIcon, CheckmarkCircle01Icon } from "hugeicons-react"

export default function Page() {
	return (
		<DashboardLayout>
			<div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
				<Card data-slot="card-root">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">สมาชิกทั้งหมด</CardTitle>
						<UserGroupIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">1,234</div>
						<p className="text-xs text-muted-foreground">+12% จากเดือนที่แล้ว</p>
					</CardContent>
				</Card>
				<Card data-slot="card-root">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">กิจกรรมใหม่</CardTitle>
						<StarIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">5</div>
						<p className="text-xs text-muted-foreground">+2 เมื่อสัปดาห์ที่แล้ว</p>
					</CardContent>
				</Card>
				<Card data-slot="card-root">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">ยืนยันแล้ว</CardTitle>
						<CheckmarkCircle01Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">890</div>
						<p className="text-xs text-muted-foreground">72% ของสมาชิกทั้งหมด</p>
					</CardContent>
				</Card>
				<Card data-slot="card-root">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">ยอดการเติบโต</CardTitle>
						<ArrowUpRight01Icon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">+24%</div>
						<p className="text-xs text-muted-foreground">ตั้งแต่เริ่มปี</p>
					</CardContent>
				</Card>
			</div>

			<div className="mt-8 grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
				<Card className="xl:col-span-2" data-slot="card-root">
					<CardHeader className="flex flex-row items-center">
						<div className="grid gap-2">
							<CardTitle>กิจกรรมล่าสุด</CardTitle>
							<p className="text-sm text-muted-foreground">รายการกิจกรรมและข่าวสารอัปเดตล่าสุดจาก YEC Lamphun</p>
						</div>
						<Button asChild size="sm" className="ml-auto gap-1">
							<a href="#">
								ดูทั้งหมด
								<ArrowUpRight01Icon className="h-4 w-4" />
							</a>
						</Button>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="flex items-center gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<StarIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="flex-1 space-y-1">
									<p className="text-sm font-medium leading-none">งานประชุมประจำปี YEC 2025</p>
									<p className="text-sm text-muted-foreground">จัดเตรียมงานและเชิญสมาชิก</p>
								</div>
								<div className="font-medium">10 พ.ย. 68</div>
							</div>
							<div className="flex items-center gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
									<UserGroupIcon className="h-5 w-5 text-primary" />
								</div>
								<div className="flex-1 space-y-1">
									<p className="text-sm font-medium leading-none">ต้อนรับสมาชิกใหม่ ไตรมาส 3</p>
									<p className="text-sm text-muted-foreground">เพิ่มสมาชิกใหม่ 45 ท่าน</p>
								</div>
								<div className="font-medium">25 ต.ค. 68</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</DashboardLayout>
	)
}
