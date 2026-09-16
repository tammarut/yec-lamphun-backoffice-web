"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { LATEST_RENEWAL_QUERY_KEY, useLatestRenewal } from "src/modules/membership-renewals/hooks/use-latest-renewal"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/shared/components/ui/dialog"
import { Skeleton } from "src/shared/components/ui/skeleton"

export type SlipViewerMember = {
	/** The member id the detail endpoint needs (GET /renewals/{member_id}). */
	id: number
	/** Display name for the dialog header — taken from the clicked table row. */
	name: string
}

type SlipViewerDialogProps = {
	/** Non-null = dialog open for that member's slip; null = closed. */
	member: SlipViewerMember | null
	onClose: () => void
}

/**
 * Read-only slip preview behind the approved row's eye action (mockup v3).
 * `renewal.payment_slip` is a 1-hour presigned URL, so a broken/ expired image
 * recovers by refetching the detail (ลองใหม่ → resetQueries → fresh URL) —
 * the recovery affordance is keyed to the member it fired for, so switching
 * members starts clean. The approve/reject review dialog is PR 3.
 */
export function SlipViewerDialog({ member, onClose }: SlipViewerDialogProps) {
	const memberId = member?.id ?? null
	const query = useLatestRenewal(memberId)
	const queryClient = useQueryClient()
	const [brokenMemberId, setBrokenMemberId] = useState<number | null>(null)
	const slipBroken = member !== null && brokenMemberId === member.id

	const handleRetry = () => {
		setBrokenMemberId(null)
		if (memberId !== null) {
			void queryClient.resetQueries({ queryKey: [...LATEST_RENEWAL_QUERY_KEY, memberId] })
		}
	}

	return (
		<Dialog
			open={member !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose()
				}
			}}
		>
			<DialogContent data-slot="slip-viewer-dialog" className="max-w-xl">
				<DialogHeader>
					<DialogTitle>หลักฐานการโอนเงิน</DialogTitle>
					<DialogDescription>{member?.name ?? ""}</DialogDescription>
				</DialogHeader>

				{query.isPending ? (
					<div data-slot="slip-viewer-skeleton" className="space-y-3">
						<Skeleton className="h-4 w-1/3" />
						<Skeleton className="h-64 w-full" />
					</div>
				) : query.isError ? (
					<Alert variant="destructive">
						<AlertTitle>โหลดหลักฐานการโอนเงินไม่สำเร็จ</AlertTitle>
						<AlertDescription className="flex items-center gap-3">
							<span>{query.error.message}</span>
							<Button variant="outline" size="sm" onClick={handleRetry}>
								<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
								ลองใหม่
							</Button>
						</AlertDescription>
					</Alert>
				) : query.data ? (
					<div data-slot="slip-viewer-body" className="space-y-3">
						<p className="text-muted-foreground text-sm">วันที่ทำรายการ: {formatThaiDate(query.data.renewal.payment_date_at)}</p>
						{slipBroken ? (
							<Alert>
								<AlertTitle>รูปสลิปหมดอายุ</AlertTitle>
								<AlertDescription className="flex items-center gap-3">
									<span>ลิงก์รูปสลิปมีอายุ 1 ชั่วโมง กรุณาโหลดใหม่อีกครั้ง</span>
									<Button variant="outline" size="sm" onClick={handleRetry}>
										<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
										ลองใหม่
									</Button>
								</AlertDescription>
							</Alert>
						) : (
							// eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not a Next image route
							<img
								src={query.data.renewal.payment_slip}
								alt={`สลิปการโอนเงินของ ${member?.name ?? ""}`}
								className="max-h-[60vh] w-full rounded-lg border object-contain"
								onError={() => {
									setBrokenMemberId(member?.id ?? null)
								}}
							/>
						)}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	)
}
