import React from "react"
import { Sidebar } from "./sidebar"
import { Header } from "./header"

interface DashboardLayoutProps {
	children: React.ReactNode
	title?: string
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
	return (
		<div className="flex min-h-screen w-full flex-col md:flex-row">
			<Sidebar />
			<div className="flex flex-1 flex-col sm:gap-4 sm:py-4">
				<Header title={title} />
				<main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
					{children}
				</main>
			</div>
		</div>
	)
}
