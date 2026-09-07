"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

import { fullNameTh } from "src/shared/components/members/member-labels"
import type { MemberListItem } from "src/shared/components/members/members-types"
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

type DeleteMemberDialogProps = {
	/** The member pending deletion; dialog renders only when non-null. */
	member: MemberListItem | null
	isDeleting: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}

/** Destructive confirm for the cascade soft delete (ADR-0013). */
export function DeleteMemberDialog({ member, isDeleting, onOpenChange, onConfirm }: DeleteMemberDialogProps) {
	return (
		<AlertDialog open={member !== null} onOpenChange={onOpenChange}>
			<AlertDialogContent data-slot="delete-member-dialog">
				<AlertDialogHeader>
					<AlertDialogMedia className="bg-destructive/10 text-destructive">
						<HugeiconsIcon icon={Delete02Icon} className="size-6" />
					</AlertDialogMedia>
					<AlertDialogTitle>ยืนยันการลบสมาชิก</AlertDialogTitle>
					<AlertDialogDescription>
						คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ <strong className="text-foreground">{member !== null ? fullNameTh(member) : ""}</strong> ออกจากระบบ?
						การกระทำนี้ไม่สามารถย้อนกลับได้
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>ยกเลิก</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isDeleting}
						data-slot="confirm-delete"
						onClick={(event) => {
							// Keep the dialog open while the DELETE request runs; the
							// parent closes it on settle.
							event.preventDefault()
							onConfirm()
						}}
					>
						{isDeleting ? "กำลังลบ..." : "ยืนยันลบ"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
