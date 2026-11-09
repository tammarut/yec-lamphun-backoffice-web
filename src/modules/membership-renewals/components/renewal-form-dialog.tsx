"use client"

import { useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Building01Icon, Cancel01Icon, CheckmarkCircleIcon, CloudUploadIcon, Copy01Icon, Delete02Icon, SentIcon } from "@hugeicons/core-free-icons"
import { err, ok, ResultAsync, type Result } from "neverthrow"

import { fullNameTh, memberStatusLabel } from "src/modules/membership-renewals/components/renewal-labels"
import { RenewalMemberCombobox } from "src/modules/membership-renewals/components/renewal-member-combobox"
import { useCreateRenewal } from "src/modules/membership-renewals/hooks/use-create-renewal"
import { useTurnstileChallenge } from "src/modules/membership-renewals/hooks/use-turnstile-challenge"
import type { ExpiredMembershipResponse } from "src/modules/membership-renewals/use-case/get-list-expired-membership/get-list-expired-membership.types"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"
import { TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE, TURNSTILE_TOKEN_HEADER, TURNSTILE_VERIFICATION_FAILED_MESSAGE } from "src/modules/shared/turnstile/constants"
import { Alert, AlertDescription, AlertTitle } from "src/shared/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Button } from "src/shared/components/ui/button"
import { Checkbox } from "src/shared/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/shared/components/ui/dialog"
import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"
import { cn } from "src/shared/lib/utils/utils"

/** Per-file size limit (7MB) and image extensions — mirrors the upload API's server rules (same client copy convention as card 03). */
const MAX_SLIP_FILE_SIZE_BYTES = 7 * 1024 * 1024
const SLIP_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const

/** Full per-member renewal rate (main member; also an additional from another business). */
const FEE_PER_BUSINESS = 5000
/** กิจการเดียวกัน ท่านที่ 2 ขึ้นไป — same-business additional-member rate (display-only). */
const SAME_BUSINESS_ADDITIONAL_FEE = 4000
/** คณะทำงาน YEC Lamphun discount per person (position ≠ GENERAL_MEMBER). */
const WORKING_TEAM_DISCOUNT_PER_MEMBER = 500

/** General-member position code — the only position without the working-team discount. */
const GENERAL_MEMBER_POSITION = "GENERAL_MEMBER"

/** ② caps at five additional members (one slip, six members total — ADR-0026). */
const MAX_ADDITIONAL_MEMBERS = 5

/** Amber non-blocking warning on a ② pick from a different business than the main member's. */
const CROSS_BUSINESS_WARNING = "ไม่ได้อยู่กิจการเดียวกันกับสมาชิกหลัก"

/** Static payment account (README §8 item 5 static copy); copied to the clipboard digits-only. */
const BANK_ACCOUNT_DISPLAY = "207-8-13870-2"

/**
 * The member fields the form's ① section displays. Deliberately looser than
 * `MemberListItemResponse`: manual mode preselects from an expired-worklist
 * row, which carries no business name (API wins over the mockup's business
 * line — same precedent as the PR 2 rejected rows).
 */
export type RenewalFormMember = {
	readonly id: number
	readonly profile_avatar: string | null
	readonly title_name_th: string
	readonly first_name_th: string
	readonly last_name_th: string
	readonly nickname: string
	readonly position: string
	readonly status: string
	readonly businessName: string | null
}

/** Adapt an autocomplete hit into the form's selected-member shape. */
function memberListItemToFormMember(member: MemberListItemResponse): RenewalFormMember {
	return {
		id: member.id,
		profile_avatar: member.profile_avatar,
		title_name_th: member.title_name_th,
		first_name_th: member.first_name_th,
		last_name_th: member.last_name_th,
		nickname: member.nickname,
		position: member.position,
		status: member.status,
		businessName: member.business.name,
	}
}

/** Adapt an expired/ rejected worklist row into the form's selected-member shape (manual mode). */
export function expiredMembershipToFormMember(member: ExpiredMembershipResponse): RenewalFormMember {
	return {
		id: member.id,
		profile_avatar: member.profile_avatar,
		title_name_th: member.title_name_th,
		first_name_th: member.first_name_th,
		last_name_th: member.last_name_th,
		nickname: member.nickname,
		position: member.position,
		status: member.status,
		businessName: null,
	}
}

/**
 * Same-business predicate — TRUE only when BOTH business names are known and
 * equal. Drives both the amber cross-business warning (via the negation seen
 * from the card) and the 4,000 same-business additional rate; an unknown
 * business (manual-mode main) therefore prices at full 5,000 with no warning.
 */
function isSameBusiness(member: RenewalFormMember, main: RenewalFormMember | null): boolean {
	return main !== null && member.businessName !== null && main.businessName !== null && member.businessName === main.businessName
}

/** Cross-business amber warning predicate (ADR-0026 §5: a warning, never a block). */
function isCrossBusiness(member: RenewalFormMember, main: RenewalFormMember | null): boolean {
	return main !== null && member.businessName !== null && main.businessName !== null && member.businessName !== main.businessName
}

/** The mockup's three missing-field summary items, in section order. */
const MISSING_FIELD_LABELS = {
	member: "เลือกสมาชิกที่ต่ออายุ",
	slip: "แนบหลักฐานการโอนเงิน (Slip)",
	consent: "ยอมรับหนังสือให้ความยินยอม (PDPA)",
} as const

/** Static PDPA consent copy (README §8 item 5 — display-only, no legal review in scope). */
const PDPA_DETAIL_TEXT = [
	"ข้าพเจ้า (เจ้าของข้อมูล) ตกลงยินยอมให้หอการค้าลำพูน เก็บ รวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของข้าพเจ้าที่มีอยู่กับหอการค้าลำพูน เพื่อประโยชน์ในการจดทะเบียนและรักษาสถานะสมาชิก การติดต่อสื่อสารเรื่องกิจกรรมและสิทธิประโยชน์ของสมาชิก ตลอดจนการจัดทำและเก็บรักษาเอกสารทะเบียนสมาชิกตามที่กฎหมายกำหนด",
	"ข้าพเจ้ามีสิทธิถอนความยินยอมได้ตลอดเวลาโดยติดต่อฝ่ายข้อมูลและทะเบียนสมาชิก ทั้งนี้การถอนความยินยอมอาจส่งผลให้ไม่สามารถดำเนินการต่ออายุสมาชิกได้",
]

function validateSlipFile(file: File): string | null {
	const extension = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`
	if (!(SLIP_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
		return `รองรับเฉพาะไฟล์รูปภาพ (${SLIP_ALLOWED_EXTENSIONS.join(", ")})`
	}
	if (file.size > MAX_SLIP_FILE_SIZE_BYTES) {
		return "ขนาดไฟล์ต้องไม่เกิน 7MB"
	}
	return null
}

/** Human-verification rejection copy (SEC-6, #130) — the widget re-arms by itself, so both invite a plain re-submit. */
const HUMAN_CHECK_FAILED_COPY = "การตรวจสอบความปลอดภัยไม่สำเร็จหรือหมดอายุ กรุณารอสักครู่แล้วกดส่งข้อมูลอีกครั้ง"
const HUMAN_CHECK_UNAVAILABLE_COPY = "ระบบตรวจสอบความปลอดภัยขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง"

/**
 * Inline copy for a failed upload/create call. Turnstile rejections are matched
 * on the server's exact wording, not the status alone: other 403s (origin
 * gate, closed window, resigned member) share the status and keep their
 * server message.
 */
function describeSubmitFailure(action: string, error: unknown): string {
	if (!(error instanceof ApiError)) {
		return `${action}: กรุณาลองใหม่อีกครั้ง`
	}
	if (error.status === 403 && error.message === TURNSTILE_VERIFICATION_FAILED_MESSAGE) {
		return HUMAN_CHECK_FAILED_COPY
	}
	if (error.status === 503 && error.message === TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE) {
		return HUMAN_CHECK_UNAVAILABLE_COPY
	}
	return `${action}: ${error.message}`
}

type StagedSlip = {
	readonly file: File
	/** CSP-safe local preview (card-03 pattern) — blob: is not allowed by the app's img-src. */
	readonly dataUrl: string
}

type RenewalFormDialogProps = {
	/** member = the public submission (แจ้งต่ออายุสมาชิก); manual = the admin renewal (ต่ออายุสมาชิก (ผู้ดูแลระบบ)). */
	mode: "member" | "manual"
	/** Manual mode opens with the clicked worklist member locked in; member mode starts empty. */
	preselectedMember?: RenewalFormMember | null
	/** Session-probe verdict (ADR-0015 fork): staff skip the human gate server-side, so they get no widget. */
	isAdmin?: boolean
	/** Server-injected Turnstile site key (SEC-6); empty = no widget (the API gate stays fail-closed). */
	turnstileSiteKey?: string
	open: boolean
	onClose: () => void
}

/**
 * The renewal form dialog (mockup v3, ①②③④ + display-only right rail; ②
 * สมาชิกเพิ่มเติม = #87's main + up to five additional members, one slip for
 * all). Submit is uploads-first: the slip goes to POST /members/file/upload
 * once, then the create endpoint receives the returned `payment_slip_file_path`
 * and `member_ids` main-first (ADR-0026) — the API takes only the opaque path.
 * Rendered ONLY while open: every open mounts a fresh body, so form state
 * (selection, slip, consent, success screen) never leaks across opens.
 */
export function RenewalFormDialog(props: RenewalFormDialogProps) {
	if (!props.open) {
		return null
	}
	return <RenewalFormDialogBody {...props} />
}

function RenewalFormDialogBody({ mode, preselectedMember = null, isAdmin = false, turnstileSiteKey = "", open, onClose }: RenewalFormDialogProps) {
	const isManual = mode === "manual"
	// Guests only (SEC-6): manual mode is staff-only, and a staff cookie skips the gate on both POSTs.
	const needsHumanCheck = !isManual && !isAdmin && turnstileSiteKey !== ""
	const createRenewal = useCreateRenewal()

	const [selected, setSelected] = useState<RenewalFormMember | null>(preselectedMember)
	const [additional, setAdditional] = useState<RenewalFormMember[]>([])
	const [pickerOpen, setPickerOpen] = useState(false)
	const [slip, setSlip] = useState<StagedSlip | null>(null)
	const [slipError, setSlipError] = useState<string | null>(null)
	const [consent, setConsent] = useState(false)
	const [showPdpaDetail, setShowPdpaDetail] = useState(false)
	const [submitAttempted, setSubmitAttempted] = useState(false)
	const [succeeded, setSucceeded] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [isSending, setIsSending] = useState(false)
	// Synchronous re-entrancy latch: a second submit event in the same tick reads
	// the same render's isSending (still false), so state alone cannot stop it.
	const sendInFlightRef = useRef(false)
	const [copiedAccount, setCopiedAccount] = useState(false)

	const {
		attachContainer: attachTurnstileContainer,
		token: turnstileToken,
		failed: turnstileFailed,
		reset: resetTurnstile,
		waitForToken: waitForTurnstileToken,
	} = useTurnstileChallenge({ siteKey: turnstileSiteKey, active: needsHumanCheck })

	// Display-only fee math (nothing sent): main 5,000; each additional 4,000
	// from the main's business, 5,000 otherwise (or when the business is
	// unverifiable); −500 per working-team member across the whole group.
	const group = [selected, ...additional]
	const groupSize = 1 + additional.length
	const additionalSubtotal = additional.reduce((sum, member) => sum + (isSameBusiness(member, selected) ? SAME_BUSINESS_ADDITIONAL_FEE : FEE_PER_BUSINESS), 0)
	const subtotal = selected !== null ? FEE_PER_BUSINESS + additionalSubtotal : null
	const committeeCount = group.filter((member) => member !== null && member.position !== GENERAL_MEMBER_POSITION).length
	const total = subtotal !== null ? subtotal - WORKING_TEAM_DISCOUNT_PER_MEMBER * committeeCount : null
	/** Success-screen roster — every renewed name, main-first, joined per the mockup. */
	const renewedNames = selected === null ? null : [selected, ...additional].map((member) => fullNameTh(member)).join(", ")

	const missing: string[] = []
	if (selected === null) {
		missing.push(MISSING_FIELD_LABELS.member)
	}
	if (slip === null) {
		missing.push(MISSING_FIELD_LABELS.slip)
	}
	if (!consent) {
		missing.push(MISSING_FIELD_LABELS.consent)
	}

	// One umbrella over upload → token re-arm wait → create: the submit never
	// re-enables between the two guarded POSTs, so a click there cannot start a
	// second flow on the token reserved for the create (footer-swap lesson).
	const isSubmitting = isSending || createRenewal.isPending
	/** Guests: submit stays locked until the widget has armed a fresh token (single-use, ~5-minute expiry). */
	const isHumanCheckPending = needsHumanCheck && turnstileToken === null

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0]
		event.target.value = ""
		if (file === undefined) {
			return
		}
		const validationError = validateSlipFile(file)
		if (validationError !== null) {
			setSlipError(validationError)
			return
		}
		setSlipError(null)
		// CSP-safe preview (card-03 pattern): img-src allows data:, not blob:.
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === "string") {
				setSlip({ file, dataUrl: reader.result })
			}
		}
		reader.readAsDataURL(file)
	}

	const clearSlip = () => {
		setSlip(null)
	}

	const addAdditional = (member: MemberListItemResponse) => {
		setAdditional((previous) => [...previous, memberListItemToFormMember(member)])
		setPickerOpen(false)
		setSubmitAttempted(false)
	}

	const removeAdditional = (id: number) => {
		setAdditional((previous) => previous.filter((member) => member.id !== id))
	}

	const handleCopyAccount = () => {
		void navigator.clipboard?.writeText(BANK_ACCOUNT_DISPLAY.replace(/-/g, ""))
		setCopiedAccount(true)
		setTimeout(() => setCopiedAccount(false), 2000)
	}

	/**
	 * Upload → (guests: wait for the re-armed token) → create. Each guarded call
	 * spends one single-use token, so the widget is reset after every send;
	 * an Err carries the inline error copy.
	 */
	const sendRenewal = async (main: RenewalFormMember, slipFile: File, uploadToken: string | null): Promise<Result<void, string>> => {
		if (needsHumanCheck) {
			// The upload spends this token: re-arm now so the create's token overlaps the upload round-trip.
			resetTurnstile()
		}
		const formData = new FormData()
		formData.append("payment_slip", slipFile)
		const uploadResult = await fetchJson<{ payment_slip_file_path: string | null }>("/api/v1/members/file/upload", {
			method: "POST",
			headers: uploadToken === null ? {} : { [TURNSTILE_TOKEN_HEADER]: uploadToken },
			body: formData,
		})
		if (uploadResult.isErr()) {
			return err(describeSubmitFailure("อัปโหลดสลิปไม่สำเร็จ", uploadResult.error))
		}
		const slipPath = uploadResult.value.payment_slip_file_path
		if (slipPath === null) {
			return err("อัปโหลดสลิปไม่สำเร็จ: ไม่ได้รับพาธไฟล์จากระบบ กรุณาลองใหม่อีกครั้ง")
		}

		let createToken: string | undefined
		if (needsHumanCheck) {
			// Rejects on a widget error or when the dialog closes mid-flow — no create fires either way.
			const tokenOutcome = await ResultAsync.fromPromise(waitForTurnstileToken(), () => HUMAN_CHECK_UNAVAILABLE_COPY)
			if (tokenOutcome.isErr()) {
				return err(tokenOutcome.error)
			}
			createToken = tokenOutcome.value
		}
		// Main-first display order (index 0 = main) — the only ordering the
		// contract carries (ADR-0026 §4); the fee rail's roles are display-only.
		const createOutcome = await ResultAsync.fromPromise(
			createRenewal.mutateAsync({
				member_ids: [main.id, ...additional.map((member) => member.id)],
				payment_slip: slipPath,
				manual: isManual,
				turnstileToken: createToken,
			}),
			(error: unknown) => describeSubmitFailure("ส่งข้อมูลไม่สำเร็จ", error)
		)
		if (createOutcome.isErr()) {
			if (needsHumanCheck) {
				// The create spent its token too: a re-submit starts over with a fresh upload token.
				resetTurnstile()
			}
			return err(createOutcome.error)
		}
		return ok(undefined)
	}

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (sendInFlightRef.current) {
			return
		}
		setSubmitAttempted(true)
		setSubmitError(null)
		const uploadToken = turnstileToken
		if (missing.length > 0 || selected === null || slip === null || (needsHumanCheck && uploadToken === null)) {
			return
		}

		sendInFlightRef.current = true
		setIsSending(true)
		const sendOutcome = await sendRenewal(selected, slip.file, uploadToken)
		setIsSending(false)
		sendInFlightRef.current = false
		if (sendOutcome.isErr()) {
			setSubmitError(sendOutcome.error)
			return
		}
		setSucceeded(true)
	}

	const title = isManual ? "ต่ออายุสมาชิก (ผู้ดูแลระบบ)" : "แจ้งต่ออายุสมาชิก"

	return (
		<Dialog
			open={open}
			onOpenChange={(dialogOpen) => {
				if (!dialogOpen) {
					onClose()
				}
			}}
		>
			<DialogContent data-slot="renewal-form-dialog" className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>กรอกข้อมูลและแนบหลักฐานการชำระเงิน</DialogDescription>
				</DialogHeader>

				{succeeded ? (
					<div data-slot="renewal-form-success" className="flex flex-col items-center space-y-3 py-8 text-center">
						<span className="bg-success/15 text-success flex size-20 items-center justify-center rounded-full">
							<HugeiconsIcon icon={CheckmarkCircleIcon} className="size-10" />
						</span>
						<h3 className="text-2xl font-bold">{isManual ? "ต่ออายุสำเร็จ" : "ส่งข้อมูลเรียบร้อยแล้ว"}</h3>
						<div className="text-muted-foreground space-y-1 text-sm">
							{renewedNames !== null && <p>ต่ออายุ: {renewedNames}</p>}
							<p className="text-foreground text-base font-bold">ยอดชำระ: {total?.toLocaleString()} บาท</p>
							<p>สถานะ: {isManual ? "ต่ออายุสำเร็จ (ปกติ)" : "รอตรวจสอบการโอนเงิน"}</p>
						</div>
						{!isManual && <p className="text-muted-foreground text-xs">ข้อมูลจะอัพเดทภายใน 1-2 วันทำการ</p>}
						<Button className="mt-2 px-8" onClick={onClose} data-slot="renewal-form-success-close">
							ปิด
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} noValidate>
						{submitAttempted && missing.length > 0 && (
							<div data-slot="renewal-form-missing" className="border-destructive/30 bg-destructive/5 mb-4 rounded-xl border p-4">
								<p className="text-destructive mb-1 flex items-center gap-2 text-sm font-bold">
									<HugeiconsIcon icon={Alert02Icon} className="size-4" />
									กรุณาดำเนินการให้ครบถ้วน:
								</p>
								<ul className="text-destructive list-inside list-disc text-sm">
									{missing.map((label) => (
										<li key={label}>{label}</li>
									))}
								</ul>
							</div>
						)}

						<div className="grid max-h-[60vh] grid-cols-1 items-start gap-6 overflow-y-auto p-1 pr-2 md:grid-cols-[1fr_280px]" data-slot="renewal-form-body">
							<div className="space-y-5">
								{/* ① สมาชิกที่ต่ออายุ */}
								<div>
									<label className="mb-1 block text-sm font-medium">
										① สมาชิกที่ต่ออายุ <span className="text-destructive">*</span>
									</label>
									{selected !== null ? (
										<div data-slot="renewal-form-selected-member" className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-xl border p-3">
											<Avatar className="size-11 shrink-0">
												{selected.profile_avatar !== null && <AvatarImage src={selected.profile_avatar} alt={fullNameTh(selected)} />}
												<AvatarFallback>{selected.first_name_th.charAt(0)}</AvatarFallback>
											</Avatar>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-bold">
													{fullNameTh(selected)}
													{selected.nickname !== "" && <span className="text-muted-foreground font-normal"> ({selected.nickname})</span>}
												</div>
												<div className="text-muted-foreground truncate text-xs">
													{selected.businessName !== null && <span>{selected.businessName} · </span>}
													สถานะ: {memberStatusLabel(selected.status)}
												</div>
											</div>
											{!isManual && (
												<button
													type="button"
													onClick={() => {
														// Additionals survive a main swap (user decision #87) —
														// warnings and the fee recompute against the new main.
														setSelected(null)
														setPickerOpen(false)
													}}
													className="text-muted-foreground hover:text-destructive p-1.5"
													aria-label="เปลี่ยนสมาชิก"
													title="เปลี่ยนสมาชิก"
													data-slot="renewal-form-clear-member"
												>
													<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
												</button>
											)}
										</div>
									) : (
										<RenewalMemberCombobox
											onSelect={(member) => {
												setSelected(memberListItemToFormMember(member))
												setPickerOpen(false)
												setSubmitAttempted(false)
											}}
										/>
									)}
								</div>

								{/* ② สมาชิกเพิ่มเติม (#87) — label always visible; the picker
								    appears only after a main member exists and caps at five.
								    Same-business is a warning only (ADR-0026 §5), never a block. */}
								<div>
									<label className="mb-1 block text-sm font-medium">
										② สมาชิกเพิ่มเติม <span className="text-muted-foreground text-xs font-normal">(4,000 บาท/คน)</span>
									</label>
									<div className="space-y-2">
										{additional.map((member) => (
											<div key={member.id} data-slot="renewal-form-additional-member" className="border-border flex items-center gap-3 rounded-xl border p-3">
												<Avatar className="size-9 shrink-0">
													{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
													<AvatarFallback>{member.first_name_th.charAt(0)}</AvatarFallback>
												</Avatar>
												<div className="min-w-0 flex-1">
													<div className="truncate text-sm font-bold">
														{fullNameTh(member)}
														{member.nickname !== "" && <span className="text-muted-foreground font-normal"> ({member.nickname})</span>}
													</div>
													{member.businessName !== null && <div className="text-muted-foreground truncate text-xs">{member.businessName}</div>}
													{isCrossBusiness(member, selected) && (
														<div className="text-warning mt-0.5 flex items-center gap-1 text-xs" data-slot="renewal-form-cross-business-warning">
															<HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" />
															{CROSS_BUSINESS_WARNING}
														</div>
													)}
												</div>
												<button
													type="button"
													onClick={() => {
														removeAdditional(member.id)
														setSubmitAttempted(false)
													}}
													className="text-muted-foreground hover:text-destructive p-1"
													aria-label={`นำ ${fullNameTh(member)} ออก`}
													title="นำสมาชิกออก"
													data-slot="renewal-form-remove-additional"
												>
													<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
												</button>
											</div>
										))}
										{selected !== null &&
											additional.length < MAX_ADDITIONAL_MEMBERS &&
											(pickerOpen ? (
												<RenewalMemberCombobox
													onSelect={addAdditional}
													excludeIds={[selected.id, ...additional.map((member) => member.id)]}
													ariaLabel="ค้นหาสมาชิกเพิ่มเติม"
													placeholder="ค้นหาสมาชิกเพิ่มเติม..."
													inputDataSlot="renewal-additional-search"
													optionDataSlot="renewal-additional-option"
												/>
											) : (
												<button
													type="button"
													onClick={() => {
														setPickerOpen(true)
														setSubmitAttempted(false)
													}}
													className="border-border text-muted-foreground hover:border-primary hover:text-primary w-full rounded-xl border border-dashed py-2 text-sm transition"
													data-slot="renewal-form-open-additional-picker"
												>
													+ เพิ่มสมาชิก
												</button>
											))}
									</div>
								</div>

								{/* ③ หลักฐานการโอนเงิน (Slip) */}
								<div>
									<label className="mb-1 block text-sm font-medium">
										③ หลักฐานการโอนเงิน (Slip) <span className="text-destructive">*</span>
									</label>
									<div
										data-slot="renewal-slip-dropzone"
										className="border-border bg-muted/30 hover:border-primary relative rounded-xl border-2 border-dashed p-6 text-center"
									>
										{slip === null ? (
											<>
												<input
													type="file"
													accept={SLIP_ALLOWED_EXTENSIONS.join(",")}
													className="absolute inset-0 cursor-pointer opacity-0"
													aria-label="แนบหลักฐานการโอนเงิน (Slip)"
													onChange={handleFileChange}
													data-slot="renewal-slip-input"
												/>
												<div className="space-y-2">
													<HugeiconsIcon icon={CloudUploadIcon} className="text-muted-foreground mx-auto size-8" />
													<p className="text-muted-foreground text-sm">คลิกเพื่ออัปโหลดไฟล์รูปภาพ</p>
													<p className="text-muted-foreground text-xs">รองรับ {SLIP_ALLOWED_EXTENSIONS.join(", ")} ขนาดไม่เกิน 7MB</p>
												</div>
											</>
										) : (
											<div className="space-y-2">
												{/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a Next image route */}
												<img src={slip.dataUrl} alt={`ตัวอย่างสลิป ${slip.file.name}`} className="mx-auto max-h-40 rounded border shadow-sm" />
												<p className="text-success text-xs font-medium">ไฟล์ที่เลือก: {slip.file.name}</p>
												<button
													type="button"
													onClick={clearSlip}
													className="text-destructive hover:text-destructive/80 text-xs font-medium"
													data-slot="renewal-slip-remove"
												>
													<HugeiconsIcon icon={Delete02Icon} className="mr-1 inline size-3.5" />
													ลบไฟล์
												</button>
											</div>
										)}
									</div>
									{slipError !== null && (
										<p className="text-destructive mt-1 text-xs font-medium" role="alert" data-slot="renewal-slip-error">
											{slipError}
										</p>
									)}
								</div>

								{/* ④ หนังสือให้ความยินยอม (PDPA) */}
								<div>
									<div className="mb-2 flex items-center justify-between">
										<span className="text-sm font-bold">④ หนังสือให้ความยินยอม (PDPA)</span>
										<button
											type="button"
											onClick={() => setShowPdpaDetail((previous) => !previous)}
											className="text-primary text-xs font-medium hover:underline"
											data-slot="renewal-pdpa-toggle"
										>
											{showPdpaDetail ? "ซ่อนรายละเอียด ▴" : "อ่านรายละเอียด ▾"}
										</button>
									</div>
									{showPdpaDetail && (
										<div className="bg-muted/50 border-border mb-3 h-48 overflow-y-auto rounded-lg border p-4 text-justify text-xs leading-relaxed">
											{PDPA_DETAIL_TEXT.map((paragraph) => (
												<p key={paragraph.slice(0, 20)} className="mb-2">
													{paragraph}
												</p>
											))}
										</div>
									)}
									<label className="flex cursor-pointer items-start gap-3">
										<Checkbox
											checked={consent}
											onCheckedChange={(checked) => setConsent(checked === true)}
											className="mt-0.5"
											aria-label={MISSING_FIELD_LABELS.consent}
											data-slot="renewal-pdpa-checkbox"
										/>
										<span className="text-sm">ข้าพเจ้าได้อ่านและยอมรับเงื่อนไขการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลข้างต้น</span>
									</label>
								</div>

								{/* Human verification (SEC-6): guests only — the widget arms the token the submit waits on. */}
								{needsHumanCheck && <div ref={attachTurnstileContainer} data-slot="renewal-turnstile-widget" />}
								{/* A broken widget would otherwise just leave submit locked; skip it when the alert already says the same. */}
								{needsHumanCheck && turnstileFailed && submitError !== HUMAN_CHECK_UNAVAILABLE_COPY && (
									<p className="text-destructive mt-1 text-xs font-medium" role="alert" data-slot="renewal-turnstile-error">
										{HUMAN_CHECK_UNAVAILABLE_COPY}
									</p>
								)}
							</div>

							{/* Right rail: display-only fee summary + payment account (nothing sent to the API) */}
							<div className="space-y-4 md:sticky md:top-0" data-slot="renewal-form-rail">
								<div className="border-primary/20 bg-primary/5 rounded-xl border p-4">
									<p className="mb-2 text-sm font-bold">สรุปค่าธรรมเนียม</p>
									<div className="space-y-1.5 text-sm">
										<div className="text-muted-foreground flex justify-between">
											<span>ค่าธรรมเนียมต่ออายุ ({groupSize} คน)</span>
											<span className="text-foreground font-semibold">{subtotal === null ? "—" : subtotal.toLocaleString()}</span>
										</div>
										<div className="text-success flex justify-between">
											<span>
												ส่วนลดคณะทำงาน ({committeeCount} คน × {WORKING_TEAM_DISCOUNT_PER_MEMBER.toLocaleString()})
											</span>
											<span className="font-semibold">−{(WORKING_TEAM_DISCOUNT_PER_MEMBER * committeeCount).toLocaleString()}</span>
										</div>
										<div className="border-primary/20 flex items-baseline justify-between border-t pt-2">
											<span className="font-bold">รวม</span>
											<span className="text-primary text-xl font-bold">{total === null ? "—" : `${total.toLocaleString()} ฿`}</span>
										</div>
									</div>
								</div>
								<div className="border-success/30 bg-success/5 flex items-center gap-3 rounded-xl border p-4">
									<span className="bg-background text-success flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm">
										<HugeiconsIcon icon={Building01Icon} className="size-5" />
									</span>
									<div className="min-w-0">
										<p className="text-muted-foreground text-xs">ธนาคารกสิกรไทย (KBANK)</p>
										<p className="text-sm font-bold">YEC LAMPHUN</p>
										<div className="flex items-center gap-1.5">
											<p className="text-success font-mono text-base tracking-wider">{BANK_ACCOUNT_DISPLAY}</p>
											<button
												type="button"
												onClick={handleCopyAccount}
												aria-label="คัดลอกเลขบัญชี"
												title="คัดลอกเลขบัญชี"
												data-slot="renewal-copy-account"
												className={cn(copiedAccount ? "text-success" : "text-muted-foreground hover:text-foreground")}
											>
												<HugeiconsIcon icon={copiedAccount ? CheckmarkCircleIcon : Copy01Icon} className="size-4" />
											</button>
											{copiedAccount && (
												<span className="text-success text-xs font-medium" role="status">
													คัดลอกแล้ว
												</span>
											)}
										</div>
									</div>
								</div>
								<p className="text-muted-foreground text-xs leading-relaxed">
									ข้อมูลใช้เวลาอัพเดท 1-2 วันทำการ หากสถานะยังไม่ถูกปรับ กรุณาติดต่อฝ่ายข้อมูลและทะเบียนสมาชิก
								</p>
							</div>
						</div>

						{submitError !== null && (
							<Alert variant="destructive" className="mt-3" data-slot="renewal-form-error">
								<AlertTitle>ส่งข้อมูลไม่สำเร็จ</AlertTitle>
								<AlertDescription>{submitError}</AlertDescription>
							</Alert>
						)}

						<div className="border-border bg-muted/30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t p-4">
							<span className="text-muted-foreground text-sm">
								รวมทั้งสิ้น <span className="text-primary text-lg font-bold">{total === null ? "—" : total.toLocaleString()}</span> บาท
							</span>
							<div className="flex gap-3">
								<Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
									ยกเลิก
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting || isHumanCheckPending}
									className={isManual ? "bg-success hover:bg-success/90 text-white" : undefined}
									data-slot="renewal-form-submit"
								>
									{isManual ? (
										<>
											<HugeiconsIcon icon={CheckmarkCircleIcon} className="size-4" />
											อนุมัติ
										</>
									) : (
										<>
											<HugeiconsIcon icon={SentIcon} className="size-4" />
											{isSubmitting ? "กำลังส่ง..." : "ส่งข้อมูล"}
										</>
									)}
								</Button>
							</div>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	)
}
