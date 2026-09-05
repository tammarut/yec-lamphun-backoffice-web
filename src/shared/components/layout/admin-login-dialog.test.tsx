import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AdminLoginDialog } from "src/shared/components/layout/admin-login-dialog"
import { SessionProvider } from "src/shared/lib/api/session"

function jsonResponse(status: number, body?: unknown) {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderDialog(onLoginResponse: (body: { username: string; password: string }) => Response) {
	const onOpenChange = vi.fn()
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url === "/api/v1/auth/session") {
			return jsonResponse(401, { error_message: "Unauthorized" })
		}
		if (url === "/api/v1/auth/login") {
			return onLoginResponse(JSON.parse(String(init?.body)) as { username: string; password: string })
		}
		return jsonResponse(404)
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	render(
		<QueryClientProvider client={queryClient}>
			<SessionProvider>
				<AdminLoginDialog open={true} onOpenChange={onOpenChange} />
			</SessionProvider>
		</QueryClientProvider>
	)

	return { onOpenChange, fetchMock }
}

async function submitCredentials() {
	fireEvent.change(await screen.findByLabelText("ชื่อผู้ใช้"), { target: { value: "admin" } })
	fireEvent.change(screen.getByLabelText("รหัสผ่าน"), { target: { value: "secret" } })
	fireEvent.click(screen.getByRole("button", { name: "เข้าสู่ระบบ" }))
}

describe("AdminLoginDialog", () => {
	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	describe("Happy cases", () => {
		it("should submit credentials and close the dialog on 204", async () => {
			const { onOpenChange, fetchMock } = renderDialog(() => jsonResponse(204))

			await submitCredentials()

			await waitFor(() => {
				expect(onOpenChange).toHaveBeenCalledWith(false)
			})
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/v1/auth/login",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ username: "admin", password: "secret" }),
				})
			)
		})

		it("should toggle password visibility", async () => {
			renderDialog(() => jsonResponse(204))
			const password = await screen.findByLabelText("รหัสผ่าน")
			expect(password.getAttribute("type")).toBe("password")

			fireEvent.click(screen.getByRole("button", { name: "แสดงรหัสผ่าน" }))
			expect(password.getAttribute("type")).toBe("text")
			expect(screen.getByRole("button", { name: "ซ่อนรหัสผ่าน" })).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("should show per-field Thai errors on empty submit without sending a request", async () => {
			const { fetchMock } = renderDialog(() => jsonResponse(204))

			fireEvent.click(await screen.findByRole("button", { name: "เข้าสู่ระบบ" }))

			expect(await screen.findByText("กรุณากรอกชื่อผู้ใช้")).toBeTruthy()
			expect(screen.getByText("กรุณากรอกรหัสผ่าน")).toBeTruthy()
			expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/auth/login", expect.anything())
		})

		it("should show the Thai invalid-credentials alert on 401 and keep the dialog open", async () => {
			const { onOpenChange } = renderDialog(() => jsonResponse(401, { error_message: "Unauthorized" }))

			await submitCredentials()

			const alert = await screen.findByRole("alert")
			expect(alert.textContent).toBe("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
			expect(onOpenChange).not.toHaveBeenCalledWith(false)
			expect(screen.getByText("ผู้ดูแลระบบ")).toBeTruthy()
		})

		it("should show a generic inline error for non-401 failures", async () => {
			const { onOpenChange } = renderDialog(() => jsonResponse(500, { error_message: "Internal Server Error" }))

			await submitCredentials()

			const alert = await screen.findByRole("alert")
			expect(alert.textContent).toBe("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
			expect(onOpenChange).not.toHaveBeenCalledWith(false)
		})
	})
})
