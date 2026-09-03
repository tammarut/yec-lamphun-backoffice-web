"use client"

import { Loading03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { toast } from "sonner"
import * as v from "valibot"

import { Alert, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/shared/components/ui/dialog"
import { Input } from "src/shared/components/ui/input"
import { Label } from "src/shared/components/ui/label"
import { ApiError } from "src/shared/lib/api/fetch-json"
import { useSession } from "src/shared/lib/api/session"

const AdminLoginFormSchema = v.object({
	username: v.pipe(v.string(), v.minLength(1, "Username is required")),
	password: v.pipe(v.string(), v.minLength(1, "Password is required")),
})

type AdminLoginDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AdminLoginDialog({ open, onOpenChange }: AdminLoginDialogProps) {
	const { loginMutation } = useSession()
	const [hasInvalidCredentials, setHasInvalidCredentials] = useState(false)

	function handleOpenChange(next: boolean) {
		if (!next) {
			setHasInvalidCredentials(false)
		}
		onOpenChange(next)
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const formData = new FormData(event.currentTarget)
		const parseResult = v.safeParse(AdminLoginFormSchema, {
			username: formData.get("username"),
			password: formData.get("password"),
		})
		if (!parseResult.success) {
			return
		}
		const { username, password } = parseResult.output

		setHasInvalidCredentials(false)
		try {
			await loginMutation.mutateAsync({ username, password })
			onOpenChange(false)
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				setHasInvalidCredentials(true)
			} else {
				toast.error("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
			}
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent data-slot="admin-login-dialog">
				<DialogHeader>
					<DialogTitle>ผู้ดูแลระบบ</DialogTitle>
					<DialogDescription>กรุณาเข้าสู่ระบบเพื่อจัดการข้อมูล</DialogDescription>
				</DialogHeader>
				{hasInvalidCredentials && (
					<Alert variant="destructive">
						<AlertTitle>ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</AlertTitle>
					</Alert>
				)}
				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="admin-login-username">ชื่อผู้ใช้</Label>
						<Input id="admin-login-username" name="username" placeholder="Username" autoComplete="username" required disabled={loginMutation.isPending} />
					</div>
					<div className="space-y-2">
						<Label htmlFor="admin-login-password">รหัสผ่าน</Label>
						<Input
							id="admin-login-password"
							name="password"
							type="password"
							placeholder="Password"
							autoComplete="current-password"
							required
							disabled={loginMutation.isPending}
						/>
					</div>
					<Button type="submit" disabled={loginMutation.isPending}>
						{loginMutation.isPending && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />}
						เข้าสู่ระบบ
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	)
}
