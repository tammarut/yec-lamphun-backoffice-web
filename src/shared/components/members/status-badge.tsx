import { Badge } from "src/shared/components/ui/badge"
import { STATUS_BADGES, type StatusBadgeTone } from "src/shared/components/members/member-labels"
import type { MemberStatus } from "src/shared/components/members/members-types"
import { cn } from "src/shared/lib/utils/utils"

/**
 * Tone styling for the Status Badge (CONTEXT.md): ปกติ = success, ยังไม่ได้ต่ออายุ
 * = warning, ลาออก = muted. Uses the theme's `--color-success` / `--color-warning`
 * tokens (with dark-mode values in globals.css).
 */
const TONE_CLASSES: Record<StatusBadgeTone, string> = {
	success: "border-transparent bg-success/15 text-success",
	warning: "border-transparent bg-warning/15 text-warning",
	muted: "border-transparent bg-muted text-muted-foreground",
}

/** Staff-only Status Badge — render inside `isAdmin` branches only. */
export function StatusBadge({ status, className }: { status: MemberStatus; className?: string }) {
	const { label, tone } = STATUS_BADGES[status]
	return (
		<Badge variant="outline" className={cn("text-[10px]", TONE_CLASSES[tone], className)}>
			{label}
		</Badge>
	)
}
