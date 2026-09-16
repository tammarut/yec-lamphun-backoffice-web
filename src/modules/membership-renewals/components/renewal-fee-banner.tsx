"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircleIcon, InformationCircleIcon, MegaphoneIcon } from "@hugeicons/core-free-icons"

/**
 * Static fee banner (mockup v3, README gap ledger item 5 — the copy is fixed
 * content, never computed and nothing is sent to the API; the PR 3 form's fee
 * rail does its own display-only math). Gradient uses semantic tokens
 * (primary → chart-3 ≈ the mockup's blue→indigo).
 */
export function RenewalFeeBanner() {
	return (
		<section data-slot="renewal-fee-banner" className="from-primary to-chart-3 text-primary-foreground relative overflow-hidden rounded-2xl bg-linear-to-r p-6 shadow-lg">
			<HugeiconsIcon icon={MegaphoneIcon} aria-hidden="true" className="absolute -top-8 -right-8 size-40 opacity-10" />
			<div className="relative z-10 flex flex-col gap-8 md:flex-row">
				<div className="flex-1">
					<h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
						<HugeiconsIcon icon={InformationCircleIcon} className="size-5" />
						อัตราค่าธรรมเนียมการต่ออายุสมาชิก
					</h3>
					<p className="text-3xl font-bold">
						5,000 บาท <span className="text-lg font-normal opacity-80">/ กิจการ</span>
					</p>
				</div>
				<div className="bg-primary-foreground/20 hidden w-px self-stretch md:block" aria-hidden="true" />
				<div className="flex-1">
					<h4 className="mb-2 font-bold">ส่วนลดพิเศษ:</h4>
					<ul className="space-y-2 text-sm">
						<li className="flex items-start gap-2">
							<HugeiconsIcon icon={CheckmarkCircleIcon} className="mt-0.5 size-4 shrink-0 opacity-80" />
							<span>
								<span className="font-semibold">กิจการเดียวกัน ท่านที่ 2</span>
								<span className="block text-xs opacity-90">ลด 1,000 บาท (ชำระเพียง 4,000 บาท)</span>
							</span>
						</li>
						<li className="flex items-start gap-2">
							<HugeiconsIcon icon={CheckmarkCircleIcon} className="mt-0.5 size-4 shrink-0 opacity-80" />
							<span>
								<span className="font-semibold">คณะทำงาน YEC Lamphun</span>
								<span className="block text-xs opacity-90">ลด 500 บาท / คน</span>
							</span>
						</li>
					</ul>
				</div>
			</div>
		</section>
	)
}
