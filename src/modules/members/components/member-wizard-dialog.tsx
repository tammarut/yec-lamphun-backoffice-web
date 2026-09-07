"use client"

import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, CheckmarkCircle01Icon, CheckmarkCircle02Icon, Loading03Icon, UserMultipleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { valibotResolver } from "@hookform/resolvers/valibot"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { FormProvider, type FieldErrors, type FieldPath, useForm } from "react-hook-form"

import { Alert, AlertTitle } from "src/shared/components/ui/alert"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "src/shared/components/ui/alert-dialog"
import { Badge } from "src/shared/components/ui/badge"
import { Button } from "src/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "src/shared/components/ui/dialog"
import { Progress } from "src/shared/components/ui/progress"
import { positionLabel } from "src/modules/members/components/member-labels"
import { clearMemberFormDraft, restoreMemberFormDraft, saveMemberFormDraft } from "src/modules/members/components/member-form-draft"
import { MemberWizardStepApplication } from "src/modules/members/components/member-wizard-step-application"
import { MemberWizardStepBusiness } from "src/modules/members/components/member-wizard-step-business"
import { MemberWizardStepPersonal } from "src/modules/members/components/member-wizard-step-personal"
import { MemberWizardStepReview } from "src/modules/members/components/member-wizard-step-review"
import { useCreateMember } from "src/modules/members/hooks/use-create-member"
import { MEMBER_WIZARD_DEFAULT_VALUES, MemberWizardSchema, STEP_FIELDS, type MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"
import { ApiError } from "src/shared/lib/api/fetch-json"
import { cn } from "src/shared/lib/utils/utils"

type WizardStep = 1 | 2 | 3 | 4

const STEP_TITLES: Record<WizardStep, string> = {
	1: "ข้อมูลการสมัคร",
	2: "ข้อมูลส่วนตัว",
	3: "ข้อมูลธุรกิจ",
	4: "ตรวจสอบข้อมูล",
}

function stepFields(step: WizardStep): FieldPath<MemberWizardFormValues>[] {
	if (step === 4) {
		return []
	}
	return [...STEP_FIELDS[step]] as FieldPath<MemberWizardFormValues>[]
}

/** How many of the current step's fields carry an error (schema or setError). */
function countStepIssues(errors: FieldErrors<MemberWizardFormValues>, fields: readonly string[]): number {
	let count = 0
	for (const field of fields) {
		let node: unknown = errors
		for (const segment of field.split(".")) {
			node = (node as Record<string, unknown> | undefined)?.[segment]
		}
		if (node !== undefined && node !== null) {
			count += 1
		}
	}
	return count
}

type MemberWizardDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * The v2 member-creation wizard (card 03, 3b-create): a near-fullscreen
 * sheet-style Dialog with a locked-forward desktop step rail, a mobile
 * ขั้นตอน X/4 progress bar, per-field blur + per-step validation with a top
 * error summary, Member Form Draft autosave/restore, a dirty-guard close
 * confirm intercepting X/Escape/outside-click, and a success dialog with
 * เพิ่มสมาชิกอีกคน. Create mode only — 3b-edit inherits the shell.
 */
export function MemberWizardDialog({ open, onOpenChange }: MemberWizardDialogProps) {
	const form = useForm<MemberWizardFormValues>({
		resolver: valibotResolver(MemberWizardSchema),
		mode: "onBlur",
		defaultValues: MEMBER_WIZARD_DEFAULT_VALUES(),
	})
	const { watch, reset, trigger, setError, getValues, handleSubmit, formState } = form
	// Read during render so RHF's formState proxy subscribes to it — a read
	// from the close-guard callback alone returns a stale value.
	const { isDirty } = formState

	const createMutation = useCreateMember()
	const submitting = createMutation.isPending

	const [step, setStep] = useState<WizardStep>(1)
	const [highestReached, setHighestReached] = useState<WizardStep>(1)
	const [completedSteps, setCompletedSteps] = useState<ReadonlySet<WizardStep>>(new Set<WizardStep>())
	const [showSummary, setShowSummary] = useState(false)
	const [draftRestored, setDraftRestored] = useState(false)
	const [closeGuardOpen, setCloseGuardOpen] = useState(false)
	const [submitError, setSubmitError] = useState<ApiError | null>(null)
	const [successOpen, setSuccessOpen] = useState(false)
	const [successName, setSuccessName] = useState("")
	const scrollRef = useRef<HTMLDivElement>(null)

	// Programmatic resets (open-restore, เริ่มกรอกใหม่, add-another) must not
	// leak into the autosave subscription as a fresh "empty" draft.
	const suppressAutosaveRef = useRef(false)
	function withSuppressedAutosave(run: () => void) {
		suppressAutosaveRef.current = true
		run()
		setTimeout(() => {
			suppressAutosaveRef.current = false
		}, 0)
	}

	// Every change saves the draft (create mode only — this dialog IS create mode).
	useEffect(() => {
		const subscription = watch((values) => {
			if (!suppressAutosaveRef.current) {
				// The subscription types values as partial, but every field has a
				// default so the runtime value is always the full shape.
				saveMemberFormDraft(values as MemberWizardFormValues)
			}
		})
		return () => subscription.unsubscribe()
	}, [watch])

	// Opening the wizard: restore the draft (if any) over pristine defaults.
	useLayoutEffect(() => {
		if (!open) {
			return
		}
		const restored = restoreMemberFormDraft()
		withSuppressedAutosave(() => {
			reset(restored ?? MEMBER_WIZARD_DEFAULT_VALUES())
		})
		setDraftRestored(restored !== null)
		setStep(1)
		setHighestReached(1)
		setCompletedSteps(new Set<WizardStep>())
		setShowSummary(false)
		setSubmitError(null)
	}, [open, reset])

	function handleStartFresh() {
		clearMemberFormDraft()
		withSuppressedAutosave(() => {
			reset(MEMBER_WIZARD_DEFAULT_VALUES())
		})
		setDraftRestored(false)
	}

	function scrollTop() {
		// Optional call: jsdom (component tests) implements neither Element.scrollTo
		// nor a scrollable layout — stepping must not depend on it.
		scrollRef.current?.scrollTo?.({ top: 0 })
	}

	function goDirect(target: WizardStep) {
		setStep(target)
		setShowSummary(false)
		scrollTop()
	}

	/**
	 * Rail navigation (create mode locks forward jumps): re-validate steps
	 * 1…target−1 in order and drop the user on the first failing one; only a
	 * fully valid prefix may be jumped past. Completed steps stay revisitable
	 * through the same gate.
	 */
	async function jumpViaRail(target: WizardStep) {
		if (target === step) {
			return
		}
		for (let current = 1; current < target; current++) {
			const valid = await trigger(stepFields(current as WizardStep))
			if (!valid) {
				setStep(current as WizardStep)
				setHighestReached((previous) => Math.max(previous, current) as WizardStep)
				setShowSummary(true)
				scrollTop()
				return
			}
		}
		setCompletedSteps((previous) => {
			const next = new Set<WizardStep>(previous)
			for (let current = 1; current < target; current++) {
				next.add(current as WizardStep)
			}
			return next
		})
		setHighestReached(target)
		goDirect(target)
	}

	/** Footer ถัดไป: validate the current step, then advance. */
	async function handleNext() {
		const valid = await trigger(stepFields(step))
		if (!valid) {
			setShowSummary(true)
			return
		}
		setCompletedSteps((previous) => new Set<WizardStep>(previous).add(step))
		const target = Math.min(step + 1, 4) as WizardStep
		setHighestReached((previous) => Math.max(previous, target) as WizardStep)
		goDirect(target)
	}

	function requestClose() {
		if (submitting) {
			return
		}
		if (!isDirty) {
			onOpenChange(false)
			return
		}
		setCloseGuardOpen(true)
	}

	function handleSaveDraftAndClose() {
		saveMemberFormDraft(getValues())
		setCloseGuardOpen(false)
		onOpenChange(false)
	}

	function handleDiscardAndClose() {
		clearMemberFormDraft()
		setCloseGuardOpen(false)
		onOpenChange(false)
	}

	const submit = handleSubmit(async (values) => {
		setSubmitError(null)
		try {
			await createMutation.mutateAsync(values)
		} catch (error) {
			if (error instanceof ApiError && error.status === 409) {
				if (error.message.includes("ID card")) {
					setError("id_card_no", { type: "conflict", message: "เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว" })
					setStep(2)
					setShowSummary(true)
					scrollTop()
					return
				}
				const positionMatch = /^Position (\S+) is already held$/.exec(error.message)
				if (positionMatch !== null) {
					const label = positionLabel(positionMatch[1] ?? "")
					setError("position", { type: "conflict", message: `ตำแหน่งนี้มีผู้ดำรงตำแหน่งอยู่แล้ว (${label})` })
					setStep(2)
					setShowSummary(true)
					scrollTop()
					return
				}
			}
			setSubmitError(error instanceof ApiError ? error : new ApiError("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 0))
			return
		}
		clearMemberFormDraft()
		setSuccessName(`${values.title_name_th}${values.first_name_th} ${values.last_name_th}`)
		onOpenChange(false)
		setSuccessOpen(true)
	})

	const stepIssueCount = showSummary ? countStepIssues(formState.errors, stepFields(step)) : 0

	return (
		<FormProvider {...form}>
			<Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
				<DialogContent
					data-slot="member-wizard-dialog"
					showCloseButton={false}
					onEscapeKeyDown={(event) => {
						event.preventDefault()
						requestClose()
					}}
					onInteractOutside={(event) => {
						event.preventDefault()
						requestClose()
					}}
					className="flex h-dvh max-w-none flex-col gap-0 rounded-none p-0 sm:h-[92vh] sm:max-w-6xl sm:rounded-2xl"
				>
					<div data-slot="wizard-header" className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
						<div className="flex items-center gap-3">
							<span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
								<HugeiconsIcon icon={UserMultipleIcon} className="size-5" />
							</span>
							<div className="min-w-0">
								<DialogTitle className="truncate text-base font-semibold sm:text-lg">ลงทะเบียนสมาชิกใหม่</DialogTitle>
								<DialogDescription className="text-muted-foreground text-xs">ระบบสมาชิก YEC Lamphun</DialogDescription>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant="outline" className="text-muted-foreground bg-muted hidden border-transparent sm:inline-flex">
								บันทึกฉบับร่างอัตโนมัติ
							</Badge>
							<Button type="button" variant="ghost" size="icon" aria-label="ปิดหน้าต่าง" onClick={requestClose} disabled={submitting}>
								<HugeiconsIcon icon={Cancel01Icon} className="size-5" />
							</Button>
						</div>
					</div>

					<form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
						<div className="border-b px-4 py-3 lg:hidden" data-slot="wizard-mobile-progress">
							<div className="mb-2 flex items-baseline justify-between">
								<span className="text-sm font-medium">
									ขั้นตอน {step}/4 · {STEP_TITLES[step]}
								</span>
								<span className="text-muted-foreground text-xs">{Math.round((step / 4) * 100)}%</span>
							</div>
							<Progress value={(step / 4) * 100} aria-label={`ขั้นตอนที่ ${step} จาก 4`} />
						</div>

						<div className="flex min-h-0 flex-1">
							<nav aria-label="ขั้นตอนการกรอกข้อมูล" data-slot="wizard-step-rail" className="hidden w-64 shrink-0 flex-col gap-1 border-r p-4 lg:flex">
								{([1, 2, 3, 4] as const).map((target) => {
									const isCurrent = step === target
									const isCompleted = completedSteps.has(target)
									const isLocked = target > highestReached
									return (
										<button
											key={target}
											type="button"
											disabled={isLocked || submitting}
											aria-current={isCurrent ? "step" : undefined}
											data-slot="wizard-rail-step"
											data-state={isCurrent ? "current" : isCompleted ? "completed" : isLocked ? "locked" : "reachable"}
											onClick={() => void jumpViaRail(target)}
											className={cn(
												"flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
												isCurrent ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
												isLocked && "text-muted-foreground/60 cursor-not-allowed hover:bg-transparent"
											)}
										>
											<span
												className={cn(
													"flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
													isCompleted
														? "border-primary bg-primary text-primary-foreground"
														: isCurrent
															? "border-primary text-primary"
															: "border-border text-muted-foreground"
												)}
											>
												{isCompleted ? <HugeiconsIcon icon={CheckmarkCircle01Icon} className="size-4" /> : target}
											</span>
											{STEP_TITLES[target]}
										</button>
									)
								})}
								<p className="text-muted-foreground mt-auto text-xs leading-relaxed">ข้อมูลจะถูกบันทึกเป็นฉบับร่างอัตโนมัติ หากปิดหน้าต่างกลางทาง</p>
							</nav>

							<div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6" data-slot="wizard-body">
								{draftRestored && (
									<div
										data-slot="wizard-draft-banner"
										className="border-warning/30 bg-warning/10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm"
									>
										<span>กู้คืนฉบับร่างที่บันทึกไว้ล่าสุดแล้ว</span>
										<Button type="button" variant="link" size="sm" onClick={handleStartFresh} className="h-auto p-0">
											เริ่มกรอกใหม่
										</Button>
									</div>
								)}
								{stepIssueCount > 0 && (
									<Alert variant="destructive" data-slot="wizard-error-summary" className="mb-4">
										<AlertTitle>{`พบข้อผิดพลาด ${stepIssueCount} รายการ กรุณาตรวจสอบข้อมูล`}</AlertTitle>
									</Alert>
								)}
								{submitError !== null && (
									<Alert variant="destructive" data-slot="wizard-submit-error" className="mb-4">
										<AlertTitle>{submitError.message}</AlertTitle>
									</Alert>
								)}
								{step === 1 && <MemberWizardStepApplication disabled={submitting} />}
								{step === 2 && <MemberWizardStepPersonal disabled={submitting} />}
								{step === 3 && <MemberWizardStepBusiness disabled={submitting} />}
								{step === 4 && <MemberWizardStepReview onEdit={goDirect} />}{" "}
							</div>
						</div>

						<div data-slot="wizard-footer" className="flex items-center justify-between gap-2 border-t px-4 py-3 sm:px-6">
							<Button type="button" variant="outline" disabled={step === 1 || submitting} onClick={() => goDirect((step - 1) as WizardStep)}>
								<HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
								ย้อนกลับ
							</Button>
							{step < 4 ? (
								<Button type="button" disabled={submitting} onClick={() => void handleNext()}>
									ถัดไป
									<HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
								</Button>
							) : (
								<Button type="submit" disabled={submitting} aria-busy={submitting} data-slot="wizard-submit">
									{submitting && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />}
									{submitting ? "กำลังบันทึก..." : "ยืนยันบันทึกข้อมูล"}
								</Button>
							)}
						</div>
					</form>
				</DialogContent>
			</Dialog>

			<AlertDialog open={closeGuardOpen} onOpenChange={setCloseGuardOpen}>
				<AlertDialogContent data-slot="wizard-close-guard">
					<AlertDialogHeader>
						<AlertDialogTitle>มีข้อมูลที่ยังไม่ได้บันทึก</AlertDialogTitle>
						<AlertDialogDescription>ต้องการบันทึกฉบับร่างไว้ก่อนออกจากหน้านี้หรือไม่?</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-col gap-2 sm:flex-col">
						<AlertDialogAction onClick={handleSaveDraftAndClose}>บันทึกฉบับร่าง</AlertDialogAction>
						<AlertDialogAction onClick={handleDiscardAndClose} className="border-input bg-background text-foreground hover:bg-muted sm:mt-0">
							ออกโดยไม่บันทึก
						</AlertDialogAction>
						<AlertDialogCancel className="sm:mt-0">แก้ไขต่อ</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={successOpen} onOpenChange={setSuccessOpen}>
				<DialogContent data-slot="wizard-success-dialog" className="sm:max-w-md">
					<div className="flex flex-col items-center gap-3 py-4 text-center">
						<span className="bg-success/15 text-success flex size-16 items-center justify-center rounded-full">
							<HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-8" />
						</span>
						<DialogTitle className="text-lg font-semibold">ลงทะเบียนสมาชิกเรียบร้อย</DialogTitle>
						<DialogDescription>ข้อมูลของ {successName} ถูกบันทึกลงระบบแล้ว</DialogDescription>
					</div>
					<div className="flex flex-col gap-2">
						<Button type="button" onClick={() => setSuccessOpen(false)}>
							ดูรายชื่อสมาชิก
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								setSuccessOpen(false)
								onOpenChange(true)
							}}
						>
							เพิ่มสมาชิกอีกคน
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</FormProvider>
	)
}
