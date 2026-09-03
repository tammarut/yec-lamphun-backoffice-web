"use client"

import { Building02Icon, Chart01Icon, HierarchySquare02Icon, IdIcon, UserGroupIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { AdminMenuButton } from "src/shared/components/layout/admin-menu-button"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "src/shared/components/ui/sidebar"

const NAV_ITEMS = [
	{ url: "/dashboard", title: "หน้าหลัก", icon: Chart01Icon },
	{ url: "/org", title: "โครงสร้างองค์กร", icon: HierarchySquare02Icon },
	{ url: "/members", title: "รายชื่อสมาชิก", icon: UserGroupIcon },
	{ url: "/renewal", title: "ต่ออายุสมาชิก", icon: IdIcon },
] as const

function AppSidebar() {
	const pathname = usePathname()
	const { setOpenMobile } = useSidebar()

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div data-slot="app-sidebar-brand" className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
						<HugeiconsIcon icon={Building02Icon} strokeWidth={2} className="size-4" />
					</span>
					<span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">YEC Lamphun</span>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{NAV_ITEMS.map((item) => (
								<SidebarMenuItem key={item.url}>
									<SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
										<Link href={item.url} onClick={() => setOpenMobile(false)}>
											<HugeiconsIcon icon={item.icon} strokeWidth={2} />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-sidebar-border border-t">
				<AdminMenuButton />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<SidebarProvider className="h-svh">
			<AppSidebar />
			<SidebarInset>
				<header data-slot="app-shell-mobile-header" className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-semibold">YEC Lamphun</span>
				</header>
				{/* SidebarInset already renders the <main> landmark; keep one main per page. */}
				<div data-slot="app-shell-main" className="flex-1 overflow-y-auto p-4 md:p-8">
					<div className="mx-auto w-full max-w-7xl">{children}</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
