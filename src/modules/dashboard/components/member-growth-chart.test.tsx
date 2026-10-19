import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { MemberGrowthChart, toYearlyPoints } from "src/modules/dashboard/components/member-growth-chart"

/**
 * jsdom has no ResizeObserver and recharts renders axis ticks only after the
 * container reports a size — the stub fires the callback once on observe()
 * with a fixed viewport so the chart renders synchronously.
 */
function stubResizeObserver() {
	vi.stubGlobal(
		"ResizeObserver",
		class ResizeObserverStub {
			private callback: (entries: ResizeObserverEntry[]) => void
			constructor(callback: (entries: ResizeObserverEntry[]) => void) {
				this.callback = callback
			}
			observe(target: Element) {
				this.callback([{ target, contentRect: { width: 640, height: 300, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) } } as ResizeObserverEntry])
			}
			unobserve() {}
			disconnect() {}
		}
	)
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("toYearlyPoints", () => {
	describe("Happy cases", () => {
		test("maps API year keys to ascending points with Buddhist-Era labels", () => {
			// Arrange
			const yearly = { "2024": 12, "2022": 4, "2023": 9 }

			// Act
			const points = toYearlyPoints(yearly)

			// Assert
			expect(points.map((point) => point.year)).toEqual(["2022", "2023", "2024"])
			expect(points.map((point) => point.label)).toEqual(["2565", "2566", "2567"])
			expect(points.map((point) => point.count)).toEqual([4, 9, 12])
		})
	})
})

describe("MemberGrowthChart", () => {
	describe("Happy cases", () => {
		test("renders Buddhist-Era year labels on the x axis", () => {
			// Arrange
			stubResizeObserver()
			const yearly = { "2022": 4, "2023": 9, "2024": 12 }

			// Act
			render(<MemberGrowthChart yearly={yearly} />)

			// Assert
			expect(screen.getByText("2565")).toBeTruthy()
			expect(screen.getByText("2567")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		test("renders the ไม่มีข้อมูล placeholder when every year count is zero", () => {
			// Arrange
			const yearly = { "2024": 0, "2025": 0, "2026": 0 }

			// Act
			render(<MemberGrowthChart yearly={yearly} />)

			// Assert
			expect(screen.getByText("ไม่มีข้อมูล")).toBeTruthy()
			expect(document.querySelector("[data-slot='member-growth-chart-empty']")).not.toBeNull()
			expect(document.querySelector("svg.recharts-surface")).toBeNull()
		})
	})
})
