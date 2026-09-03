"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { Toaster } from "sonner"

import { SessionProvider } from "src/shared/lib/api/session"
import { TooltipProvider } from "src/shared/components/ui/tooltip"

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// API failures surface inline or as toasts; retrying 401/404 only delays the error state.
						retry: false,
					},
				},
			})
	)

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<SessionProvider>
					{children}
					<Toaster richColors />
				</SessionProvider>
			</TooltipProvider>
		</QueryClientProvider>
	)
}
