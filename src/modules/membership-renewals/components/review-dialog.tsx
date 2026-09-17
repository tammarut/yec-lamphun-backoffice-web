"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Refresh01Icon } from "@hugeicons/core-free-icons"
import { useQueryClient } from "@tanstack/react-query"

import { formatThaiDate } from "src/modules/membership-renewals/components/format-thai-date"
import { fullNameTh, positionLabel } from "src/modules/membership-renewals/components/renewal-labels"
import { LATEST_RENEWAL_QUERY_KEY, useLatestRenewal } from "src/modules/membership-renewals/hooks/use-latest-renewal"
import { useReviewRenewal } from "src/modules/membership-renewals/hooks/use-review-renewal"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/shared/components/ui/dialog"
import { Skeleton } from "src/shared/components/ui/skeleton"
import { Textarea } from "src/shared/components/ui/textarea"

export type ReviewDialogTarget = {
	/** The member id GET /renewals/{member_id} needs (grid + presigned slip). */
	memberId: number
	/** The PATCH target — present only when acting on a PENDING_REVIEW row. */
	renewalId?: number
	/** Display name from the clicked row for the header description. */
	name: string
	state: "PENDING_REVIEW" | "APPROVED" | "REJECTED"
}

type ReviewDialogProps = {
	/** Non-null = open for that member; null = closed. */
	target: ReviewDialogTarget | null
	onClose: () => void
}

/**
 * The admin review dialog (mockup v3): ONE dialog, three row states —
 * ตรวจสอบการชำระเงิน (pending: approve / reject-with-reason), หลักฐานการโอนเงิน
 * (approved: read-only) and คำขอต่ออายุที่ไม่อนุมัติ (rejected: read-only +
 * the reason line). Member grid + slip come from GET /renewals/{member_id};
 * the presigned URL recovers from expiry the same way (ลองใหม่ → resetQueries).
 * A 409 (someone decided it first) surfaces inline while the settle-time
 * invalidation refetches the lists. Rendered ONLY for a target: every open
 * mounts a fresh body, so a half-typed reject draft never leaks to the next
 * member.
 */
export function ReviewDialog(props: ReviewDialogProps) {
	if (props.target === null) {
		return null
	}
	return <ReviewDialogBody target={props.target} onClose={props.onClose} />
}

function ReviewDialogBody({ target, onClose }: { target: ReviewDialogTarget; onClose: () => void }) {
	const memberId = target.memberId
	const query = useLatestRenewal(memberId)
	const queryClient = useQueryClient()
	const review = useReviewRenewal()

	const [isRejecting, setIsRejecting] = useState(false)
	const [rejectReason, setRejectReason] = useState("")
	const [brokenMemberId, setBrokenMemberId] = useState<number | null>(null)
	const slipBroken = brokenMemberId === memberId

	const handleRetry = () => {
		setBrokenMemberId(null)
		void queryClient.resetQueries({ queryKey: [...LATEST_RENEWAL_QUERY_KEY, memberId] })
	}

	const handleApprove = () => {
		if (target?.renewalId === undefined) {
			return
		}
		review.mutate({ renewalId: target.renewalId, decision: "APPROVED" }, { onSuccess: onClose })
	}

	const handleConfirmReject = () => {
		const reason = rejectReason.trim()
		if (reason === "" || target?.renewalId === undefined) {
			return
		}
		review.mutate({ renewalId: target.renewalId, decision: "REJECTED", reason }, { onSuccess: onClose })
	}

	const title = target?.state === "REJECTED" ? "คำขอต่ออายุที่ไม่อนุมัติ" : target?.state === "APPROVED" ? "หลักฐานการโอนเงิน" : "ตรวจสอบการชำระเงิน"

	return (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose()
				}
			}}
		>
			<DialogContent data-slot="review-dialog" className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{target?.name ?? ""}</DialogDescription>
				</DialogHeader>

				{query.isPending ? (
					<div data-slot="review-dialog-skeleton" className="space-y-3">
						<Skeleton className="h-24 w-full rounded-xl" />
						<Skeleton className="h-64 w-full rounded-xl" />
					</div>
				) : query.isError ? (
					<Alert variant="destructive">
						<AlertTitle>โหลดข้อมูลการต่ออายุไม่สำเร็จ</AlertTitle>
						<AlertDescription className="flex items-center gap-3">
							<span>{query.error.message}</span>
							<Button variant="outline" size="sm" onClick={handleRetry}>
								<HugeiconsIcon icon={Refresh01Icon} className="size-4" />
								ลองใหม่
							</Button>
						</AlertDescription>
					</Alert>
				) : query.data ? (
					<div className="max-h-[65vh] space-y-4 overflow-y-auto p-1 pr-2">
						{/* ข้อมูลสมาชิก grid */}
						<div data-slot="review-dialog-member-grid" className="border-primary/20 bg-primary/5 rounded-xl border p-4">
							<h4 className="text-primary/90 mb-3 text-sm font-bold">ข้อมูลสมาชิก</h4>
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<p className="text-muted-foreground text-xs">ชื่อ-สกุล</p>
									<p className="font-semibold">{fullNameTh(query.data)}</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">ชื่อเล่น</p>
									<p className="font-semibold">{query.data.nickname !== "" ? query.data.nickname : "-"}</p>
								</div>
								<div className="col-span-2">
									<p className="text-muted-foreground text-xs">กิจการ</p>
									<p className="truncate font-semibold" title={query.data.business.name}>
										{query.data.business.name !== "" ? query.data.business.name : "-"}
									</p>
								</div>
								<div className="col-span-2">
									<p className="text-muted-foreground text-xs">เบอร์โทรศัพท์</p>
									<p className="font-semibold">{query.data.phone_no}</p>
								</div>
								<div className="col-span-2">
									<p className="text-muted-foreground text-xs">ประเภทสมาชิก</p>
									<p className="font-semibold">{positionLabel(query.data.position)}</p>
								</div>
								{target?.state === "REJECTED" && (
									<div className="col-span-2" data-slot="review-dialog-rejection">
										<p className="text-muted-foreground text-xs">
											{`เหตุผลที่ไม่อนุมัติ (เมื่อ ${query.data.renewal.rejected_at === null ? "-" : formatThaiDate(query.data.renewal.rejected_at)})`}
										</p>
										<p className="border-destructive/20 bg-destructive/5 text-destructive mt-1 rounded-lg border p-2.5 text-sm font-medium">
											{query.data.renewal.rejection_reason ?? "-"}
										</p>
									</div>
								)}
							</div>
						</div>

						{/* Slip panel (presigned 1-hour URL) */}
						<div data-slot="review-dialog-slip" className="bg-muted/30 border-border flex flex-col items-center rounded-xl border p-4">
							<p className="text-muted-foreground mb-2 text-sm">หลักฐานการโอนเงิน (Slip)</p>
							<p className="text-muted-foreground mb-2 text-xs">วันที่ทำรายการ: {formatThaiDate(query.data.renewal.payment_date_at)}</p>
							{slipBroken ? (
								<Alert className="w-full">
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
									alt={`สลิปการโอนเงินของ ${target?.name ?? ""}`}
									className="max-h-[50vh] w-full rounded-lg border object-contain"
									onError={() => {
										setBrokenMemberId(memberId)
									}}
								/>
							)}
						</div>

						{review.isError && (
							<Alert variant="destructive" data-slot="review-dialog-error">
								<AlertTitle>บันทึกการตรวจสอบไม่สำเร็จ</AlertTitle>
								<AlertDescription>{review.error.message}</AlertDescription>
							</Alert>
						)}

						{/* Actions: approve / reject-with-reason only for pending rows */}
						{target?.state === "PENDING_REVIEW" ? (
							!isRejecting ? (
								<div className="flex gap-3" data-slot="review-dialog-actions">
									<Button
										variant="outline"
										className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 flex-1"
										onClick={() => setIsRejecting(true)}
										disabled={review.isPending}
										data-slot="review-dialog-reject-start"
									>
										ไม่อนุมัติ
									</Button>
									<Button
										className="bg-success hover:bg-success/90 flex-1 text-white"
										onClick={handleApprove}
										disabled={review.isPending || target.renewalId === undefined}
										data-slot="review-dialog-approve"
									>
										{review.isPending ? "กำลังบันทึก..." : "อนุมัติ"}
									</Button>
								</div>
							) : (
								<div className="space-y-3" data-slot="review-dialog-reject-form">
									<label htmlFor="review-reject-reason" className="block text-sm font-bold">
										ระบุเหตุผลที่ไม่อนุมัติ
									</label>
									<Textarea
										id="review-reject-reason"
										rows={3}
										placeholder="เช่น สลิปไม่ชัดเจน, ยอดเงินไม่ถูกต้อง..."
										value={rejectReason}
										onChange={(event) => setRejectReason(event.target.value)}
									/>
									<div className="flex gap-3">
										<Button
											variant="outline"
											className="flex-1"
											onClick={() => setIsRejecting(false)}
											disabled={review.isPending}
											data-slot="review-dialog-reject-cancel"
										>
											ยกเลิก
										</Button>
										<Button
											variant="destructive"
											className="flex-1"
											onClick={handleConfirmReject}
											disabled={rejectReason.trim() === "" || review.isPending}
											data-slot="review-dialog-reject-confirm"
										>
											ยืนยันไม่อนุมัติ
										</Button>
									</div>
								</div>
							)
						) : (
							<div className="flex flex-col items-center gap-3" data-slot="review-dialog-readonly-footer">
								{target.state === "REJECTED" && (
									<p className="text-muted-foreground text-center text-xs">
										คำขอนี้ถูกไม่อนุมัติแล้ว — เมื่อสมาชิกชำระเงินใหม่ ใช้ปุ่ม &quot;ต่ออายุ (Manual)&quot; ในรายการ หรือรอสมาชิกแจ้งชำระใหม่
									</p>
								)}
								<Button variant="outline" onClick={onClose} data-slot="review-dialog-close">
									ปิดหน้าต่าง
								</Button>
							</div>
						)}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	)
}
