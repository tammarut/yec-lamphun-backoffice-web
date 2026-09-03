"use client"

import { Settings02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "src/shared/components/ui/sidebar"
import { cn } from "src/shared/lib/utils/utils"
import { useSession } from "src/shared/lib/api/session"

import { AdminLoginDialog } from "src/shared/components/layout/admin-login-dialog"
import { AdminLogoutConfirmDialog } from "src/shared/components/layout/admin-logout-confirm-dialog"

/**
 * Sidebar footer entry for admin mode: opens the login dialog when logged out
 * and the logout confirmation when the admin session is active.
 */
export function AdminMenuButton() {
	const { isAdmin, isCheckingSession } = useSession()
	const [loginOpen, setLoginOpen] = useState(false)
	const [logoutOpen, setLogoutOpen] = useState(false)

	return (
		<SidebarMenu data-slot="admin-menu">
			<SidebarMenuItem>
				<SidebarMenuButton
					disabled={isCheckingSession}
					tooltip={isAdmin ? "ออกจากโหมดผู้ดูแลระบบ" : "สำหรับผู้ดูแลระบบ"}
					onClick={() => (isAdmin ? setLogoutOpen(true) : setLoginOpen(true))}
					className={cn(isAdmin ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground")}
				>
					<HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
					<span>{isAdmin ? "Admin Mode" : "ผู้ดูแลระบบ"}</span>
				</SidebarMenuButton>
			</SidebarMenuItem>

			<AdminLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
			<AdminLogoutConfirmDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
		</SidebarMenu>
	)
}
