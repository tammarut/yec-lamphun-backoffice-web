"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Download02Icon } from "@hugeicons/core-free-icons"

import { Button } from "src/shared/components/ui/button"

type BulkActionsBarProps = {
	/** Number of currently selected members. */
	count: number
	onExport: () => void
}

/**
 * Staff bulk bar (mockup): "เลือกแล้ว N รายการ" + Export CSV. The mockup's two
 * status-change buttons are intentionally absent — Member Status is renewal-
 * flow-owned (README §8 item 8).
 */
export function BulkActionsBar({ count, onExport }: BulkActionsBarProps) {
	return (
		<div data-slot="bulk-actions-bar" className="bg-primary/5 text-primary flex items-center justify-between rounded-xl border p-3">
			<div className="flex items-center gap-2 font-medium">
				<span>เลือกแล้ว {count} รายการ</span>
			</div>
			<Button variant="outline" size="sm" className="bg-card" onClick={onExport}>
				<HugeiconsIcon icon={Download02Icon} className="size-4" />
				Export CSV
			</Button>
		</div>
	)
}
