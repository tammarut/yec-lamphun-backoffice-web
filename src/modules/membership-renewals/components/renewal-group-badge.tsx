import { HugeiconsIcon } from "@hugeicons/react"
import { UserMultiple03Icon } from "@hugeicons/core-free-icons"

import { Badge } from "src/shared/components/ui/badge"
import { cn } from "src/shared/lib/utils/utils"

type RenewalGroupBadgeProps = {
	/** The row's group_size from the list read — live renewals sharing one payment slip. */
	groupSize: number
	className?: string
}

/**
 * ส่งพร้อมกัน N คน / สลิปใบเดียวกัน chip — marks a worklist row as one payment
 * of a Renewal Group (ADR-0026). Ported verbatim from the committed mockup
 * demo (1c8cee5): users icon + count text + native-title tooltip; the icon and
 * Thai text carry the meaning, so it never relies on color alone. Rendered
 * only when groupSize > 1 by the caller.
 */
export function RenewalGroupBadge({ groupSize, className }: RenewalGroupBadgeProps) {
	return (
		<Badge
			variant="outline"
			data-slot="renewal-group-badge"
			className={cn("border-primary/20 bg-primary/10 text-primary gap-1.5 rounded-full text-[11px]", className)}
			title="สมาชิกกลุ่มนี้ส่งคำขอต่ออายุพร้อมกันด้วยสลิปการโอนเงินใบเดียวกัน"
		>
			<HugeiconsIcon icon={UserMultiple03Icon} aria-hidden="true" />
			ส่งพร้อมกัน {groupSize} คน / สลิปใบเดียวกัน
		</Badge>
	)
}
