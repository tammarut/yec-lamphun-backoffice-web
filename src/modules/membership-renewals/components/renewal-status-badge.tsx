import type { RenewalStatus } from "src/modules/membership-renewals/domain/membership-renewal"
import { renewalStatusLabel, renewalStatusTone, type RenewalStatusBadgeTone } from "src/modules/membership-renewals/components/renewal-labels"
import { Badge } from "src/shared/components/ui/badge"
import { cn } from "src/shared/lib/utils/utils"

/**
 * Tone styling for the Renewal Status pill: ปกติ = success, รอตรวจสอบ =
 * pending (soft yellow), ไม่อนุมัติ = destructive. Uses the theme's semantic
 * tokens (with dark-mode values in globals.css).
 */
const TONE_CLASSES: Record<RenewalStatusBadgeTone, string> = {
	success: "border-transparent bg-success/15 text-success",
	warning: "border-transparent bg-warning/15 text-warning",
	pending: "border-transparent bg-pending/15 text-pending",
	destructive: "border-destructive/30 bg-destructive/10 text-destructive",
}

type RenewalStatusBadgeProps = {
	status: RenewalStatus
	/** The REJECTED label is audience-aware (ไม่อนุมัติ vs กรุณาติดต่อเจ้าหน้าที่). */
	isAdmin: boolean
	className?: string
}

export function RenewalStatusBadge({ status, isAdmin, className }: RenewalStatusBadgeProps) {
	return (
		<Badge variant="outline" className={cn("text-[10px]", TONE_CLASSES[renewalStatusTone(status)], className)}>
			{renewalStatusLabel(status, isAdmin)}
		</Badge>
	)
}
