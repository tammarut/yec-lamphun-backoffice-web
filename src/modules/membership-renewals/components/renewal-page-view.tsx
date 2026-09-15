"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Refresh01Icon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { RenewalFeeBanner } from "src/modules/membership-renewals/components/renewal-fee-banner"
import { RenewalGate } from "src/modules/membership-renewals/components/renewal-gate"
import { RenewalStats, type RenewalFilter } from "src/modules/membership-renewals/components/renewal-stats"
import { RenewalTable } from "src/modules/membership-renewals/components/renewal-table"
import { RenewalToggle } from "src/modules/membership-renewals/components/renewal-toggle"
import { RenewalWorklistView } from "src/modules/membership-renewals/components/renewal-worklist-view"
import { SYSTEM_SETTINGS_QUERY_KEY, useSystemSettings } from "src/modules/membership-renewals/hooks/use-system-settings"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { useSession } from "src/shared/lib/api/session"

/**
 * Membership Renewal page (mockup v3), composed per the card's PR 2b split:
 * settings gate → closed state (member) or red banner (admin); header with the
 * admin เปิด/ปิด toggle; static fee banner; the three clickable stat cards
 * filtering the area below (ยังไม่ได้ต่ออายุ = the PR 2 worklist, otherwise the
 * รอตรวจสอบ/ปกติ table). All renewal WRITES stay in PR 3.
 */
export function RenewalPageView() {
	const { isAdmin, isCheckingSession } = useSession()
	const settings = useSystemSettings()
	const queryClient = useQueryClient()

	if (settings.isPending) {
		return <RenewalPageSkeleton />
	}
	if (settings.isError) {
		return (
			<div data-slot="renewal-page-error">
				<Alert variant="destructive">
					<AlertTitle>โหลดการตั้งค่าระบบไม่สำเร็จ</AlertTitle>
					<AlertDescription className="flex items-center gap-3">
						<span>{settings.error.message}</span>
						<Button variant="outline" size="sm" onClick={() => queryClient.resetQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY })}>
							<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
							ลองใหม่
						</Button>
					</AlertDescription>
				</Alert>
			</div>
		)
	}

	const isOpen = settings.data.open_membership_renewal

	// Closed system: deciding between the member gate and the admin page needs
	// the session probe settled — hold on the skeleton until it is.
	if (!isOpen && isCheckingSession) {
		return <RenewalPageSkeleton />
	}
	if (!isOpen && !isAdmin) {
		return <RenewalGate />
	}

	// Keyed by audience so the body's default filter re-initializes when the
	// session probe resolves an admin (mockup default: admins land on the
	// รอตรวจสอบ review queue) — keyed state instead of a set-state effect.
	return <RenewalPageBody key={isAdmin ? "admin" : "member"} isAdmin={isAdmin} isOpen={isOpen} />
}

type RenewalPageBodyProps = {
	isAdmin: boolean
	/** Whether the renewal window is open (`open_membership_renewal`). */
	isOpen: boolean
}

function RenewalPageBody({ isAdmin, isOpen }: RenewalPageBodyProps) {
	const [filter, setFilter] = useState<RenewalFilter>(isAdmin ? "PENDING_REVIEW" : "NOT_RENEWED")

	return (
		<div data-slot="renewal-page-view" className="space-y-6">
			<div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
				<div className="flex items-center gap-4">
					<h1 className="text-2xl font-bold">ระบบต่ออายุสมาชิก</h1>
					{isAdmin && <RenewalToggle />}
				</div>
			</div>

			{!isOpen && isAdmin && (
				<div data-slot="renewal-closed-banner" className="border-destructive/20 bg-destructive/5 text-destructive flex items-center gap-3 rounded-xl border px-4 py-3">
					<HugeiconsIcon icon={Alert02Icon} className="size-5 shrink-0" />
					<span className="text-sm font-medium">ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้)</span>
				</div>
			)}

			<RenewalFeeBanner />
			<RenewalStats filter={filter} onSelect={setFilter} />

			{filter === "NOT_RENEWED" ? <RenewalWorklistView /> : <RenewalTable status={filter} />}
		</div>
	)
}

function RenewalPageSkeleton() {
	return (
		<div data-slot="renewal-page-skeleton" className="space-y-6" aria-busy="true" aria-label="กำลังโหลดหน้าต่ออายุสมาชิก">
			<Skeleton className="h-8 w-64" />
			<Skeleton className="h-32 w-full rounded-2xl" />
			<div className="flex gap-2">
				<Skeleton className="h-11 min-w-[180px] flex-1 rounded-xl" />
				<Skeleton className="h-11 min-w-[180px] flex-1 rounded-xl" />
				<Skeleton className="h-11 min-w-[180px] flex-1 rounded-xl" />
			</div>
			<Skeleton className="h-48 w-full rounded-2xl" />
		</div>
	)
}
