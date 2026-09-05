"use client"

import { Logout01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

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
import { useSession } from "src/shared/lib/api/session"

type AdminLogoutConfirmDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AdminLogoutConfirmDialog({ open, onOpenChange }: AdminLogoutConfirmDialogProps) {
	const { logoutMutation } = useSession()

	// The dialog closes immediately on confirm; failures surface as a toast so
	// admin mode visibly survives when the server rejects the logout.
	function handleLogout() {
		logoutMutation.mutate(undefined, {
			onError: () => toast.error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
		})
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent data-slot="admin-logout-confirm-dialog">
				<AlertDialogHeader>
					<AlertDialogMedia>
						<HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
					</AlertDialogMedia>
					<AlertDialogTitle>ยืนยันการออกจากระบบ</AlertDialogTitle>
					<AlertDialogDescription>คุณต้องการออกจากโหมดผู้ดูแลระบบใช่หรือไม่?</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>ยกเลิก</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={handleLogout}>
						ออกจากระบบ
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
