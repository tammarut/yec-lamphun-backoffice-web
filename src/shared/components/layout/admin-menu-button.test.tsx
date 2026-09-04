import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AdminMenuButton } from "src/shared/components/layout/admin-menu-button"
import { SidebarProvider } from "src/shared/components/ui/sidebar"
import { TooltipProvider } from "src/shared/components/ui/tooltip"
import { SessionProvider } from "src/shared/lib/api/session"

// jsdom has no matchMedia; the sidebar's use-mobile hook needs it.
vi.stubGlobal(
	"matchMedia",
	vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	})
)

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/**
 * Mirrors the server's cookie/session behaviour: /session and /logout return
 * 204 only while a session exists, including the logout route's 401 quirk
 * when the session cookie is already gone.
 */
function stubApiFetch() {
	const server = { loggedIn: false }
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") return server.loggedIn ? jsonResponse(204) : jsonResponse(401, { error_message: "Unauthorized" })
		if (url === "/api/v1/auth/login") {
			server.loggedIn = true
			return jsonResponse(204)
		}
		if (url === "/api/v1/auth/logout") {
			if (!server.loggedIn) return jsonResponse(401)
			server.loggedIn = false
			return jsonResponse(204)
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)
	return { fetchMock, server }
}

function renderAdminMenu() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	render(
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<SessionProvider>
					<SidebarProvider>
						<AdminMenuButton />
						<Toaster position="top-right" richColors />
					</SidebarProvider>
				</SessionProvider>
			</TooltipProvider>
		</QueryClientProvider>
	)
}

async function waitForGearLabel(expected: string) {
	await waitFor(() => {
		const gear = document.querySelector("[data-slot='admin-menu'] [data-sidebar='menu-button'] span")
		const label = gear?.textContent?.trim()
		if (label !== expected) throw new Error(`gear label is "${label}", waiting for "${expected}"`)
	})
}

async function clickGear() {
	const gear = document.querySelector("[data-slot='admin-menu'] [data-sidebar='menu-button']") as HTMLButtonElement
	// The gear stays disabled while the initial session probe is in flight.
	await waitFor(() => {
		if (gear.disabled) throw new Error("gear still disabled (session probe pending)")
	})
	fireEvent.click(gear)
}

async function loginThroughDialog() {
	await clickGear()
	const username = await screen.findByLabelText("ชื่อผู้ใช้")
	fireEvent.change(username, { target: { value: "admin" } })
	fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "secret" } })
	fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }))
	await waitForGearLabel("Admin Mode")
}

let api: ReturnType<typeof stubApiFetch>

describe("AdminMenuButton session cycle", () => {
	beforeEach(() => {
		api = stubApiFetch()
	})
	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
		vi.stubGlobal(
			"matchMedia",
			vi.fn().mockReturnValue({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			})
		)
	})

	describe("Happy cases", () => {
		it("should revert the gear to the logged-out view after logout, then offer login again", async () => {
			renderAdminMenu()
			await waitForGearLabel("ผู้ดูแลระบบ")

			await loginThroughDialog()

			// Logout through the confirm dialog
			await clickGear()
			fireEvent.click(await screen.findByRole("button", { name: "ออกจากระบบ" }))
			// Regression guard: a 401 session refetch retains the last successful
			// data in TanStack v5 — the gear must still revert to the logged-out view.
			await waitForGearLabel("ผู้ดูแลระบบ")

			// The next gear click opens the LOGIN dialog again, not another logout confirm
			await clickGear()
			expect(await screen.findByText("กรุณาเข้าสู่ระบบเพื่อจัดการข้อมูล")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("should surface a logout failure as a toast when the session is already gone server-side", async () => {
			renderAdminMenu()
			await waitForGearLabel("ผู้ดูแลระบบ")

			await loginThroughDialog()

			// Session destroyed behind the UI (server restart / expiry)
			api.server.loggedIn = false

			await clickGear()
			fireEvent.click(await screen.findByRole("button", { name: "ออกจากระบบ" }))
			await waitFor(() => {
				const toasts = [...document.querySelectorAll("[data-sonner-toast]")].map((el) => el.textContent)
				if (!toasts.some((t) => t?.includes("ออกจากระบบไม่สำเร็จ"))) {
					throw new Error(`expected logout failure toast, got: ${toasts.join(",")}`)
				}
			})
		})
	})
})
