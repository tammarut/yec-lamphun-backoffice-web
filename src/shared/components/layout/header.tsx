import { HugeiconsIcon } from "@hugeicons/react"
import { Menu01Icon, Notification01Icon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { Button } from "src/shared/components/ui/button"

export function Header() {
	return (
		<header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
			<Button variant="outline" size="icon" className="shrink-0 md:hidden" disabled>
				<HugeiconsIcon icon={Menu01Icon} size={20} className="h-5 w-5" />
				<span className="sr-only">Toggle navigation menu</span>
			</Button>
			<div className="w-full flex-1">
				<h1 className="text-lg font-semibold md:text-xl">Dashboard</h1>
			</div>
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" disabled>
					<HugeiconsIcon icon={Notification01Icon} size={20} className="h-5 w-5" />
					<span className="sr-only">Toggle notifications</span>
				</Button>
				<Button variant="ghost" size="icon" className="rounded-full" disabled>
					<HugeiconsIcon icon={UserCircleIcon} size={24} className="h-6 w-6" />
					<span className="sr-only">Toggle user menu</span>
				</Button>
			</div>
		</header>
	)
}
