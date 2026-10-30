"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { UserMinus01Icon } from "@hugeicons/core-free-icons"

import { fullNameTh } from "src/modules/membership-renewals/components/renewal-labels"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "src/shared/components/ui/alert-dialog"

type ResignMemberDialogProps = {
	/** The expired member pending resignation; dialog renders only when non-null. */
	member: ExpiredMembershipResponse | null
	isResigning: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}

/** Destructive confirm for ลาออก (RENEWAL-2) — clones the member-delete dialog's pending semantics. */
export function ResignMemberDialog({ member, isResigning, onOpenChange, onConfirm }: ResignMemberDialogProps) {
	return (
		<AlertDialog open={member !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent data-slot="resign-member-dialog">
				<AlertDialogHeader>
					<AlertDialogMedia className="bg-destructive/10 text-destructive">
						<HugeiconsIcon icon={UserMinus01Icon} className="size-6" />
					</AlertDialogMedia>
					<AlertDialogTitle>ยืนยันการลาออก</AlertDialogTitle>
					<AlertDialogDescription>
						คุณแน่ใจหรือไม่ว่าต้องการให้ <strong className="text-foreground">{member !== null ? fullNameTh(member) : ""}</strong> ลาออกจากสถานะสมาชิก?
						การกระทำนี้ไม่สามารถย้อนกลับได้
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isResigning}>ยกเลิก</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isResigning}
						data-slot="confirm-resign"
						onClick={(event) => {
							// Keep the dialog open while the resign request runs; the
							// parent closes it on success.
							event.preventDefault()
							onConfirm()
						}}
					>
						{isResigning ? "กำลังบันทึก..." : "ยืนยันลาออก"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
