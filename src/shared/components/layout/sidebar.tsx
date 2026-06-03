import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon, UserGroupIcon, Calendar01Icon, Settings01Icon } from "@hugeicons/core-free-icons"
import { cn } from "src/shared/lib/utils/utils"

interface SidebarItemProps {
	icon: any
	label: string
	isActive?: boolean
	isDisabled?: boolean
}

function SidebarItem({ icon, label, isActive, isDisabled }: SidebarItemProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
				isActive
					? "bg-primary text-primary-foreground"
					: isDisabled
						? "cursor-not-allowed opacity-50 hover:bg-transparent"
						: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
			)}
		>
			{icon}
			<span>{label}</span>
		</div>
	)
}

export function Sidebar() {
	return (
		<aside className="hidden h-screen w-64 flex-col border-r bg-background md:flex">
			<div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
				<div className="flex items-center gap-2 font-semibold">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<span className="text-sm font-bold">YEC</span>
					</div>
					<span className="">YEC Lamphun</span>
				</div>
			</div>
			<div className="flex-1 overflow-auto py-4">
				<nav className="grid items-start px-2 text-sm font-medium lg:px-4">
					<SidebarItem
						icon={<HugeiconsIcon icon={Home01Icon} size={20} />}
						label="หน้าหลัก"
						isActive={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={UserGroupIcon} size={20} />}
						label="สมาชิก"
						isDisabled={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={Calendar01Icon} size={20} />}
						label="กิจกรรม"
						isDisabled={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={Settings01Icon} size={20} />}
						label="การตั้งค่า"
						isDisabled={true}
					/>
				</nav>
			</div>
		</aside>
	)
}
