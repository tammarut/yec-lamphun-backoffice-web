import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import { DashboardView } from "src/modules/dashboard/components/dashboard-view"

const routerPushMock = vi.fn()

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: routerPushMock }),
}))

// The real chart pulls recharts sizing machinery; the view test only asserts
// the data handed to it — the chart's own rendering is covered by
// member-growth-chart.test.tsx.
vi.mock("src/modules/dashboard/components/member-growth-chart", () => ({
	MemberGrowthChart: ({ yearly }: { yearly: Readonly<Record<string, number>> }) => <div data-slot="member-growth-chart-stub" data-years={JSON.stringify(yearly)} />,
}))

const STAT_FIXTURE = {
	total_members: 42,
	total_active_members: 30,
	total_expired_members: 8,
	total_businesses: 25,
	total_members_each_year: { "2022": 4, "2023": 9, "2024": 12, "2025": 11, "2026": 6 },
}

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function renderView(fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
	vi.stubGlobal("fetch", vi.fn(fetchMock))
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return render(<DashboardView />, { wrapper })
}

function statResponse(body: unknown): Promise<Response> {
	return Promise.resolve(jsonResponse(200, body))
}

beforeEach(() => {
	routerPushMock.mockClear()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("DashboardView", () => {
	describe("Happy cases", () => {
		test("renders all four KPI cards with the API counts", async () => {
			// Arrange
			const view = renderView(() => statResponse(STAT_FIXTURE))
			// KPI labels render while pending — wait for the resolved value instead.
			await screen.findByText("42")

			// Act
			const memberCard = view.container.querySelector("[data-count-key='total_members']")
			const businessCard = view.container.querySelector("[data-count-key='total_businesses']")
			const activeCard = view.container.querySelector("[data-count-key='total_active_members']")
			const notRenewedCard = view.container.querySelector("[data-count-key='total_expired_members']")

			// Assert
			expect(memberCard?.textContent).toContain("42")
			expect(businessCard?.textContent).toContain("25")
			expect(activeCard?.textContent).toContain("30")
			expect(notRenewedCard?.textContent).toContain("8")
		})

		test("hands the per-year map to the chart", async () => {
			// Arrange
			renderView(() => statResponse(STAT_FIXTURE))
			await screen.findByText("ตรวจสอบสมาชิก")

			// Act
			const chart = document.querySelector("[data-slot='member-growth-chart-stub']")

			// Assert
			expect(chart).not.toBeNull()
			expect(chart?.getAttribute("data-years")).toBe(JSON.stringify(STAT_FIXTURE.total_members_each_year))
		})

		test("the ค้นหาสมาชิก CTA navigates to /members", async () => {
			// Arrange
			renderView(() => statResponse(STAT_FIXTURE))
			const cta = await screen.findByRole("button", { name: "ค้นหาสมาชิก" })

			// Act
			fireEvent.click(cta)

			// Assert
			expect(routerPushMock).toHaveBeenCalledWith("/members")
		})

		test("renders KPI zeros and the empty yearly map when all counts are zero", async () => {
			// Arrange
			const emptyFixture = { total_members: 0, total_active_members: 0, total_expired_members: 0, total_businesses: 0, total_members_each_year: { "2025": 0, "2026": 0 } }
			const view = renderView(() => statResponse(emptyFixture))
			// Wait for success (banner renders only after resolve), then read zeros.
			await screen.findByText("ตรวจสอบสมาชิก")

			// Act
			const memberCard = view.container.querySelector("[data-count-key='total_members']")
			const chart = document.querySelector("[data-slot='member-growth-chart-stub']")

			// Assert
			expect(memberCard?.textContent).toContain("0")
			expect(chart?.getAttribute("data-years")).toBe(JSON.stringify(emptyFixture.total_members_each_year))
		})
	})

	describe("Unhappy cases", () => {
		test("renders skeletons while the query is pending", () => {
			// Arrange
			const view = renderView(() => new Promise<Response>(() => {}))

			// Act
			const skeletons = view.container.querySelectorAll("[data-slot='dashboard-stat-card'] [data-slot='skeleton']")

			// Assert
			expect(skeletons.length).toBe(4)
			expect(screen.queryByText("ตรวจสอบสมาชิก")).toBeNull()
		})

		test("shows the API error_message with a รีเฟรช retry", async () => {
			// Arrange — first request fails, the retried one succeeds
			let calls = 0
			renderView(() => {
				calls += 1
				return calls === 1 ? Promise.resolve(jsonResponse(500, { error_message: "Internal Server Error" })) : statResponse(STAT_FIXTURE)
			})
			const retry = await screen.findByRole("button", { name: "รีเฟรช" })

			// Act
			fireEvent.click(retry)

			// Assert
			expect(await screen.findByText("ตรวจสอบสมาชิก")).toBeTruthy()
			expect(screen.queryByRole("button", { name: "รีเฟรช" })).toBeNull()
		})
	})
})
