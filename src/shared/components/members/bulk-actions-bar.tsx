"use client"

type BulkActionsBarProps = {
	/** Number of currently selected members. */
	count: number
}

/**
 * Staff bulk bar (mockup): "เลือกแล้ว N รายการ". The mockup's two status-change
 * buttons are intentionally absent — Member Status is renewal-flow-owned
 * (README §8 item 8) — and Export CSV lives in the toolbar so it stays reachable
 * with nothing selected (exporting with a selection still prefers it).
 */
export function BulkActionsBar({ count }: BulkActionsBarProps) {
	return (
		<div data-slot="bulk-actions-bar" className="bg-primary/5 text-primary flex items-center justify-between rounded-xl border p-3">
			<div className="flex items-center gap-2 font-medium">
				<span>เลือกแล้ว {count} รายการ</span>
			</div>
		</div>
	)
}
