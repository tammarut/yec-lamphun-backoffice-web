import { HugeiconsIcon } from "@hugeicons/react"
import { AddressBookIcon, BubbleChatIcon, CallIcon, FacebookIcon, Location01Icon } from "@hugeicons/core-free-icons"

import { Card, CardContent, CardHeader, CardTitle } from "src/shared/components/ui/card"

/**
 * Static contact channels (mockup copy, verbatim). Facebook links out for
 * real; LINE Official stays a non-link tile — the mockup's `href="#"` is a
 * dead placeholder and there is no LINE URL in any spec. Phone 053-510-686
 * follows the mockup per README §8 gap-ledger item 4 (renewal page shows a
 * different number; each page keeps its own until the client confirms).
 */
export function ContactCard() {
	return (
		<Card data-slot="contact-card" className="flex flex-col">
			<CardHeader className="border-b">
				<CardTitle className="flex items-center gap-2 text-lg">
					<HugeiconsIcon icon={AddressBookIcon} className="text-primary size-5" />
					ช่องทางการติดต่อ
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col justify-center gap-6">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<a
						href="https://www.facebook.com/yeclamphun"
						target="_blank"
						rel="noopener noreferrer"
						data-slot="contact-channel-facebook"
						className="bg-chart-1/10 hover:border-chart-1/30 flex items-center gap-4 rounded-2xl border p-4 transition hover:shadow-md"
					>
						<div className="bg-primary text-primary-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
							<HugeiconsIcon icon={FacebookIcon} className="size-6" />
						</div>
						<div className="min-w-0">
							<h4 className="font-bold">Facebook Page</h4>
							<p className="text-primary truncate text-sm font-medium">YEC Lamphun</p>
							<span className="text-muted-foreground mt-1 block text-xs">ติดตามข่าวสารและกิจกรรม</span>
						</div>
					</a>
					<div data-slot="contact-channel-line" className="bg-success/10 border-success/20 flex items-center gap-4 rounded-2xl border p-4">
						<div className="bg-success text-primary-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
							<HugeiconsIcon icon={BubbleChatIcon} className="size-6" />
						</div>
						<div className="min-w-0">
							<h4 className="font-bold">LINE Official</h4>
							<p className="text-success text-sm font-medium">@yeclamphun</p>
							<span className="text-muted-foreground mt-1 block text-xs">ติดต่อสอบถามข้อมูล</span>
						</div>
					</div>
				</div>
				<div className="bg-muted/50 text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-xl border p-4 text-sm md:flex-row md:gap-6">
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={Location01Icon} className="text-destructive size-4" />
						<span>สำนักงานหอการค้าจังหวัดลำพูน</span>
					</div>
					<div aria-hidden="true" className="bg-border hidden w-px self-stretch md:block" />
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={CallIcon} className="size-4" />
						<span>053-510-686</span>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
