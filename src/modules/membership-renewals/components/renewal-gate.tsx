"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { CalendarRemove01Icon, Call02Icon } from "@hugeicons/core-free-icons"

/**
 * Full-page closed state for NON-admin visitors (mockup v3): the renewal
 * window is shut, so the whole page collapses to an announcement plus the
 * registration-desk contact card. The phone number is THIS page's mockup
 * number (053-511-168 — README gap ledger item 4 keeps it per-mockup until
 * the client confirms; the Dashboard card uses a different one by design).
 */
export function RenewalGate() {
	return (
		<div data-slot="renewal-gate" className="flex flex-col items-center justify-center p-8 text-center">
			<span className="bg-muted mb-6 flex size-24 items-center justify-center rounded-full">
				<HugeiconsIcon icon={CalendarRemove01Icon} className="text-muted-foreground size-10" />
			</span>
			<h2 className="mb-2 text-2xl font-bold">ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ</h2>
			<p className="text-muted-foreground mb-6 max-w-md">ขณะนี้ระบบปิดรับการแจ้งต่ออายุสมาชิกชั่วคราว กรุณาติดต่อสอบถามเพิ่มเติมได้ที่ฝ่ายข้อมูลและทะเบียนสมาชิก</p>
			<div className="bg-card flex items-center gap-4 rounded-xl border p-4 text-left shadow-sm">
				<span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
					<HugeiconsIcon icon={Call02Icon} className="size-5" />
				</span>
				<span>
					<span className="text-muted-foreground block text-xs font-bold">ติดต่อเจ้าหน้าที่</span>
					<span className="block font-bold">053-511-168</span>
				</span>
			</div>
		</div>
	)
}
