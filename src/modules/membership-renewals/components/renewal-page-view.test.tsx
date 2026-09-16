import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { RenewalPageView } from "src/modules/membership-renewals/components/renewal-page-view"
import { SessionProvider } from "src/shared/lib/api/session"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

const OPEN_SETTINGS = { open_membership_renewal: true }
const CLOSED_SETTINGS = { open_membership_renewal: false }
const STAT_BODY = { total_expired_members: 7, total_pending_review_members: 3, total_approved_members: 12 }
const EMPTY_PAGE = { data: [], has_more: false, next_cursor: null }

type PageOptions = {
	sessionOk: boolean
	settingsBody?: unknown
	settingsStatus?: number
	/** Overrides the settings GET entirely (e.g. a never-settling response for the loading state). */
	settingsResponse?: Response | Promise<Response>
}

/**
 * Render the whole renewal page against a stubbed fetch. `sessionOk` toggles
 * the admin probe (204 = staff, 401 = public); `settingsBody`/`settingsStatus`
 * shape the GET /system-settings response.
 */
function renderPage(options: PageOptions) {
	// The fake server tracks the flag mutably — a POST-PATCH settings refetch
	// must return the NEW value (a stale GET would legitimately revert the
	// optimistic flip and defeat the behavior under test).
	let serverOpen = (options.settingsBody as { open_membership_renewal?: boolean } | undefined)?.open_membership_renewal ?? true
	const settingsFail = options.settingsStatus !== undefined && options.settingsStatus !== 200
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") {
			return jsonResponse(options.sessionOk ? 204 : 401, options.sessionOk ? undefined : { error_message: "Unauthorized" })
		}
		if (url === "/api/v1/system-settings") {
			if (init?.method === "PATCH") {
				const body = JSON.parse(String(init.body)) as { open_membership_renewal: boolean }
				serverOpen = body.open_membership_renewal
				return jsonResponse(200, { open_membership_renewal: serverOpen })
			}
			if (options.settingsResponse) {
				return options.settingsResponse
			}
			if (settingsFail) {
				return jsonResponse(options.settingsStatus ?? 500, options.settingsBody ?? { error_message: "Internal Server Error" })
			}
			return jsonResponse(200, { open_membership_renewal: serverOpen })
		}
		if (url === "/api/v1/membership/renewals/stat") {
			return jsonResponse(200, STAT_BODY)
		}
		if (url.startsWith("/api/v1/membership/renewals/expired")) {
			return jsonResponse(200, EMPTY_PAGE)
		}
		if (/^\/api\/v1\/membership\/renewals\?/.test(url)) {
			return jsonResponse(200, EMPTY_PAGE)
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const view = render(
		<QueryClientProvider client={queryClient}>
			<SessionProvider>
				<RenewalPageView />
			</SessionProvider>
		</QueryClientProvider>
	)
	return { fetchMock, queryClient, ...view }
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("RenewalPageView", () => {
	describe("Gate", () => {
		it("closed + member: full-page gate with the contact card and nothing else", async () => {
			renderPage({ sessionOk: false, settingsBody: CLOSED_SETTINGS })

			expect(await screen.findByText("ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ")).toBeTruthy()
			expect(screen.getByText("ติดต่อเจ้าหน้าที่")).toBeTruthy()
			expect(screen.getByText("053-511-168")).toBeTruthy()
			expect(screen.queryByText("อัตราค่าธรรมเนียมการต่ออายุสมาชิก")).toBeNull()
			expect(screen.queryByText("ยังไม่ได้ต่ออายุ")).toBeNull()
			// The gate short-circuits before the stat cards mount.
			expect(screen.queryByText("โหลดจำนวนสรุปไม่สำเร็จ")).toBeNull()
		})

		it("closed + admin: the page stays visible under the red closed banner", async () => {
			renderPage({ sessionOk: true, settingsBody: CLOSED_SETTINGS })

			expect(await screen.findByText("ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้)")).toBeTruthy()
			expect(screen.getByText("อัตราค่าธรรมเนียมการต่ออายุสมาชิก")).toBeTruthy()
			// The member gate must NOT render for an admin.
			expect(screen.queryByText("ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ")).toBeNull()
			// Admin toggle present, ปิด side active.
			expect(screen.getByRole("button", { name: "เปิด" }).getAttribute("aria-pressed")).toBe("false")
			expect(screen.getByRole("button", { name: "ปิด" }).getAttribute("aria-pressed")).toBe("true")
		})

		it("open system: no closed banner for anyone", async () => {
			renderPage({ sessionOk: false, settingsBody: OPEN_SETTINGS })

			await waitFor(() => expect(screen.getByText("อัตราค่าธรรมเนียมการต่ออายุสมาชิก")).toBeTruthy())
			expect(screen.queryByText("ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้)")).toBeNull()
		})

		it("settings still loading: page skeleton, not a flash of the gate", async () => {
			const { container } = renderPage({
				sessionOk: false,
				settingsResponse: new Promise<Response>(() => {}),
			})

			expect(container.querySelector('[data-slot="renewal-page-skeleton"]')).toBeTruthy()
			expect(screen.queryByText("ยังไม่อยู่ในช่วงระยะเวลาการต่ออายุ")).toBeNull()
		})

		it("settings failure: destructive alert with the server message and retry", async () => {
			renderPage({ sessionOk: false, settingsStatus: 500, settingsBody: { error_message: "Internal Server Error" } })

			expect(await screen.findByText("โหลดการตั้งค่าระบบไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("Internal Server Error")).toBeTruthy()
		})
	})

	describe("Stat cards and filter area", () => {
		it("renders the three /stat counts and switches the area below on click", async () => {
			const { fetchMock } = renderPage({ sessionOk: false, settingsBody: OPEN_SETTINGS })

			// Default (member): the worklist area, fed by the expired endpoint.
			expect(await screen.findByText("หมดอายุ — ยังไม่แจ้งต่ออายุ")).toBeTruthy()

			// Counts from /stat (the authoritative ยังไม่ได้ต่ออายุ superset).
			expect(screen.getByText("ยังไม่ได้ต่ออายุ")).toBeTruthy()
			expect(screen.getByText("7")).toBeTruthy()
			expect(screen.getByText("3")).toBeTruthy()
			expect(screen.getByText("12")).toBeTruthy()

			// Click รอตรวจสอบการโอน → the status=PENDING_REVIEW table replaces the worklist.
			fireEvent.click(screen.getByRole("button", { name: /รอตรวจสอบการโอน/ }))
			await waitFor(() => expect(screen.queryByText("หมดอายุ — ยังไม่แจ้งต่ออายุ")).toBeNull())

			// Click ปกติ (ต่ออายุแล้ว) → the status=APPROVED table fetch.
			fireEvent.click(screen.getByRole("button", { name: /ปกติ \(ต่ออายุแล้ว\)/ }))
			await waitFor(() => {
				const listUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/v1/membership/renewals?"))
				expect(listUrls.some((url) => url.includes("status=PENDING_REVIEW"))).toBe(true)
				expect(listUrls.some((url) => url.includes("status=APPROVED"))).toBe(true)
			})
		})

		it("admin: session resolution lands the default filter on the review queue", async () => {
			const { fetchMock } = renderPage({ sessionOk: true, settingsBody: OPEN_SETTINGS })

			await waitFor(() => {
				const listUrls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith("/api/v1/membership/renewals?"))
				expect(listUrls.some((url) => url.includes("status=PENDING_REVIEW"))).toBe(true)
			})
		})
	})

	describe("Admin toggle", () => {
		it("clicking เปิด PATCHes the boolean and optimistically clears the red banner", async () => {
			const { fetchMock } = renderPage({ sessionOk: true, settingsBody: CLOSED_SETTINGS })

			expect(await screen.findByText("ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้)")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: "เปิด" }))

			await waitFor(() => expect(screen.queryByText("ระบบแจ้งต่ออายุปิดอยู่ (สมาชิกทั่วไปจะไม่เห็นหน้านี้)")).toBeNull())
			const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
			expect((patch?.[1] as RequestInit | undefined)?.body).toBe(JSON.stringify({ open_membership_renewal: true }))
			// The optimistic flip moves the toggle's active side immediately.
			expect(screen.getByRole("button", { name: "เปิด" }).getAttribute("aria-pressed")).toBe("true")
		})

		it("member never sees the toggle", async () => {
			renderPage({ sessionOk: false, settingsBody: OPEN_SETTINGS })

			await waitFor(() => expect(screen.getByText("อัตราค่าธรรมเนียมการต่ออายุสมาชิก")).toBeTruthy())
			expect(screen.queryByRole("button", { name: "เปิด" })).toBeNull()
			expect(screen.queryByRole("button", { name: "ปิด" })).toBeNull()
		})
	})
})
