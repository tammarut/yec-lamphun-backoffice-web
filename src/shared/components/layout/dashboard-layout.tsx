import React from "react"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./header"
import { SidebarProvider } from "src/shared/components/ui/sidebar"

interface DashboardLayoutProps {
	children: React.ReactNode
	title: string
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<div className="flex flex-1 flex-col sm:gap-4 sm:py-4">
				<Header title={title} />
				<main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
					{children}
				</main>
			</div>
		</SidebarProvider>
	)
}
