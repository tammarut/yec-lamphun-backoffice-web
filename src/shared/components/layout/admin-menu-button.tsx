"use client"

import { Logout01Icon, Settings02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "src/shared/components/ui/sidebar"
import { cn } from "src/shared/lib/utils/utils"
import { useSession } from "src/shared/lib/api/session"

export type AdminDialogMode = "login" | "logout"

type AdminMenuButtonProps = {
	/** Opens the matching admin dialog, which lives in the AppShell (outside the sidebar). */
	onOpen: (mode: AdminDialogMode) => void
}

/**
 * Sidebar footer entry for admin mode: opens the login dialog when logged out
 * and the logout confirmation when the admin session is active. The dialogs
 * themselves are owned by the AppShell — this component only reports intent.
 */
export function AdminMenuButton({ onOpen }: AdminMenuButtonProps) {
	const { isAdmin, isCheckingSession } = useSession()
	const { setOpenMobile } = useSidebar()

	function handleClick() {
		// On mobile the sidebar is a drawer; close it so the dialog opens as the
		// only modal, one task later to skip the drawer's focus-return animation.
		setOpenMobile(false)
		setTimeout(() => onOpen(isAdmin ? "logout" : "login"), 0)
	}

	return (
		<SidebarMenu data-slot="admin-menu">
			<SidebarMenuItem>
				<SidebarMenuButton
					size="lg"
					className={cn(
						"text-muted-foreground px-3 text-base group-data-[collapsible=icon]:justify-center [&_svg]:size-5 group-data-[collapsible=icon]:[&>span:last-child]:hidden",
						isAdmin && "text-destructive hover:bg-destructive/10 hover:text-destructive"
					)}
					disabled={isCheckingSession}
					tooltip={isAdmin ? "ออกจากระบบ" : "สำหรับผู้ดูแลระบบ"}
					onClick={handleClick}
				>
					<HugeiconsIcon icon={isAdmin ? Logout01Icon : Settings02Icon} strokeWidth={2} />
					<span>{isAdmin ? "ออกจากระบบ" : "ผู้ดูแลระบบ"}</span>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
