"use client"

import { useSystemSettings } from "src/modules/membership-renewals/hooks/use-system-settings"
import { useUpdateSystemSettings } from "src/modules/membership-renewals/hooks/use-update-system-settings"
import { cn } from "src/shared/lib/utils/utils"

type RenewalToggleProps = {
	className?: string
}

/**
 * Admin เปิด/ปิด pill (mockup v3): a segmented two-button control where the
 * active side reads เปิด = green / ปิด = red. Both buttons PATCH the same
 * `open_membership_renewal` boolean; the optimistic update flips the shared
 * settings cache instantly (gate + red banner follow) and rolls back on
 * failure. This is PR 2b's only write, and it is a settings write — the
 * renewal write flows are PR 3.
 */
export function RenewalToggle({ className }: RenewalToggleProps) {
	const settings = useSystemSettings()
	const update = useUpdateSystemSettings()

	// The pill only renders once the cached value is known — otherwise the
	// active side would flash.
	if (!settings.data) {
		return null
	}
	const isOpen = settings.data.open_membership_renewal

	return (
		<div
			data-slot="renewal-toggle"
			role="group"
			aria-label="เปิดหรือปิดระบบแจ้งต่ออายุสมาชิก"
			className={cn("bg-muted flex items-center gap-1 rounded-full border p-1", className)}
		>
			<button
				type="button"
				aria-pressed={isOpen}
				disabled={update.isPending}
				data-slot="renewal-toggle-open"
				onClick={() => update.mutate({ open_membership_renewal: true })}
				className={cn(
					"rounded-full px-3 py-1 text-xs font-bold transition",
					isOpen ? "bg-success text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
				)}
			>
				เปิด
			</button>
			<button
				type="button"
				aria-pressed={!isOpen}
				disabled={update.isPending}
				data-slot="renewal-toggle-close"
				onClick={() => update.mutate({ open_membership_renewal: false })}
				className={cn(
					"rounded-full px-3 py-1 text-xs font-bold transition",
					!isOpen ? "bg-destructive text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
				)}
			>
				ปิด
			</button>
		</div>
	)
}
