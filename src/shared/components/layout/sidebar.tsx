import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon, UserGroupIcon, HierarchySquare01Icon, IdCardLanyardIcon, ShieldUserIcon } from "@hugeicons/core-free-icons"
import { cn } from "src/shared/lib/utils/utils"

interface SidebarItemProps {
	icon: any
	label: string
	isActive?: boolean
	isDisabled?: boolean
}

function SidebarItem({ icon, label, isActive, isDisabled }: SidebarItemProps) {
	return (
		<button
			type="button"
			disabled={isDisabled}
			aria-current={isActive ? "page" : undefined}
			className={cn(
				"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
				isActive
					? "bg-primary text-primary-foreground"
					: isDisabled
						? "cursor-not-allowed opacity-50 hover:bg-transparent"
						: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
			)}
		>
			{icon}
			<span>{label}</span>
		</button>
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
					<span>YEC Lamphun</span>
				</div>
			</div>
			<div className="flex flex-1 flex-col overflow-auto py-4">
				<nav className="grid items-start gap-1 px-2 text-sm font-medium lg:px-4">
					<SidebarItem
						icon={<HugeiconsIcon icon={Home01Icon} size={20} />}
						label="หน้าหลัก"
						isActive={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={HierarchySquare01Icon} size={20} />}
						label="โครงสร้างองค์กร"
						isDisabled={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={UserGroupIcon} size={20} />}
						label="รายชื่อสมาชิก"
						isDisabled={true}
					/>
					<SidebarItem
						icon={<HugeiconsIcon icon={IdCardLanyardIcon} size={20} />}
						label="ต่ออายุสมาชิก"
						isDisabled={true}
					/>
				</nav>
				<div className="mt-auto border-t border-border px-2 pt-4 lg:px-4">
					<SidebarItem
						icon={<HugeiconsIcon icon={ShieldUserIcon} size={20} />}
						label="ผู้ดูแลระบบ"
						isDisabled={true}
					/>
				</div>
			</div>
		</aside>
	)
}
