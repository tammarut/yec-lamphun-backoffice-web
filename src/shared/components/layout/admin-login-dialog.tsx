"use client"

import { Loading03Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { valibotResolver } from "@hookform/resolvers/valibot"
import { useState } from "react"
import { useForm } from "react-hook-form"
import * as v from "valibot"

import { Alert, AlertTitle } from "src/shared/components/ui/alert"
import { Button } from "src/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/shared/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "src/shared/components/ui/field"
import { Input } from "src/shared/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "src/shared/components/ui/input-group"
import { ApiError } from "src/shared/lib/api/fetch-json"
import { useSession } from "src/shared/lib/api/session"

const LoginSchema = v.object({
	username: v.pipe(v.string(), v.minLength(1, "กรุณากรอกชื่อผู้ใช้")),
	password: v.pipe(v.string(), v.minLength(1, "กรุณากรอกรหัสผ่าน")),
})

type LoginFormValues = v.InferInput<typeof LoginSchema>

type AdminLoginDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function AdminLoginDialog({ open, onOpenChange }: AdminLoginDialogProps) {
	const { loginMutation } = useSession()
	const [apiError, setApiError] = useState<"invalid-credentials" | "unexpected" | null>(null)
	const [showPassword, setShowPassword] = useState(false)

	const {
		register,
		handleSubmit,
		clearErrors,
		setFocus,
		formState: { errors, isSubmitting },
	} = useForm<LoginFormValues>({
		resolver: valibotResolver(LoginSchema),
		defaultValues: { username: "", password: "" },
	})

	function handleOpenChange(next: boolean) {
		if (!next) {
			setApiError(null)
			setShowPassword(false)
			clearErrors()
		}
		onOpenChange(next)
	}

	async function handleSubmitLogin(values: LoginFormValues) {
		setApiError(null)
		try {
			await loginMutation.mutateAsync(values)
			onOpenChange(false)
		} catch (error) {
			setApiError(error instanceof ApiError && error.status === 401 ? "invalid-credentials" : "unexpected")
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-slot="admin-login-dialog"
				onOpenAutoFocus={(event) => {
					// Focus the first field instead of the dialog's close button.
					event.preventDefault()
					setFocus("username")
				}}
			>
				<DialogHeader>
					<DialogTitle>ผู้ดูแลระบบ</DialogTitle>
					<DialogDescription>กรุณาเข้าสู่ระบบเพื่อจัดการข้อมูล</DialogDescription>
				</DialogHeader>
				{apiError === "invalid-credentials" && (
					<Alert variant="destructive">
						<AlertTitle>ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</AlertTitle>
					</Alert>
				)}
				{apiError === "unexpected" && (
					<Alert variant="destructive">
						<AlertTitle>เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</AlertTitle>
					</Alert>
				)}
				<form className="space-y-4" noValidate onSubmit={handleSubmit(handleSubmitLogin)}>
					<FieldGroup>
						<Field data-invalid={errors.username ? true : undefined}>
							<FieldLabel htmlFor="admin-login-username">ชื่อผู้ใช้</FieldLabel>
							<Input
								id="admin-login-username"
								placeholder="Username"
								autoComplete="username"
								aria-invalid={errors.username ? true : undefined}
								disabled={isSubmitting}
								{...register("username")}
							/>
							<FieldError errors={[errors.username]} />
						</Field>
						<Field data-invalid={errors.password ? true : undefined}>
							<FieldLabel htmlFor="admin-login-password">รหัสผ่าน</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id="admin-login-password"
									type={showPassword ? "text" : "password"}
									placeholder="Password"
									autoComplete="current-password"
									aria-invalid={errors.password ? true : undefined}
									disabled={isSubmitting}
									{...register("password")}
								/>
								<InputGroupAddon align="inline-end">
									<InputGroupButton
										type="button"
										size="icon-xs"
										variant="ghost"
										disabled={isSubmitting}
										onClick={() => setShowPassword((visible) => !visible)}
										aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
									>
										<HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} strokeWidth={2} />
									</InputGroupButton>
								</InputGroupAddon>
							</InputGroup>
							<FieldError errors={[errors.password]} />
						</Field>
					</FieldGroup>
					<Button type="submit" className="w-full" aria-busy={isSubmitting} disabled={isSubmitting}>
						{isSubmitting && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />}
						เข้าสู่ระบบ
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	)
}
