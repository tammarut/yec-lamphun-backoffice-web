import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PersonCard, VacantPositionCard } from "src/modules/organization/components/person-card"
import { makeCommitteeNode } from "src/modules/organization/components/make-committee-node.fixture"

afterEach(() => {
	cleanup()
})

describe("PersonCard", () => {
	describe("Happy cases", () => {
		it("renders the Thai name with nickname, position, and business", () => {
			render(<PersonCard node={makeCommitteeNode()} />)

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("(ชาย)")).toBeTruthy()
			expect(screen.getByText("ประธาน")).toBeTruthy()
			expect(screen.getByText("ร้านกาแฟสมชาย")).toBeTruthy()
		})

		it("falls back to the first-name initial when there is no avatar URL", () => {
			render(<PersonCard node={makeCommitteeNode({ profile_avatar: null })} />)

			expect(screen.getByText("ส")).toBeTruthy()
		})

		it("marks the president variant so the tree can emphasize the root", () => {
			const { container } = render(<PersonCard node={makeCommitteeNode()} variant="president" />)

			expect(container.querySelector('[data-slot="person-card"]')?.getAttribute("data-variant")).toBe("president")
		})
	})

	describe("Unhappy cases", () => {
		it("omits the business line when business_name is null", () => {
			render(<PersonCard node={makeCommitteeNode({ business_name: null })} />)

			expect(screen.queryByText("ร้านกาแฟสมชาย")).toBeNull()
		})

		it("omits the business line (and its divider) when business_name is an empty string", () => {
			// Scrutiny F2: the guard mirrors nickname's null-and-empty check —
			// an empty business_name must not leave an orphaned border-t divider.
			const { container } = render(<PersonCard node={makeCommitteeNode({ business_name: "" })} />)

			// Only the position <p> remains; no empty business <p> with a divider.
			expect(container.querySelectorAll("p")).toHaveLength(1)
			expect(container.querySelector('[data-slot="person-card"]')?.textContent).toContain("ประธาน")
		})
	})
})

describe("VacantPositionCard", () => {
	describe("Happy cases", () => {
		it("renders the position title as a dashed placeholder card with an icon avatar", () => {
			const { container } = render(<VacantPositionCard title="รองประธานฝ่ายกฎหมาย" caption="ตำแหน่งว่าง" />)

			expect(screen.getByText("รองประธานฝ่ายกฎหมาย")).toBeTruthy()
			expect(screen.getByText("ตำแหน่งว่าง")).toBeTruthy()
			expect(container.querySelector('[data-slot="vacant-position-card"]')).toBeTruthy()
			expect(container.querySelector('[data-slot="vacant-avatar"]')).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("omits the caption when none is given (the ยังไม่มีประธาน state reads alone)", () => {
			render(<VacantPositionCard title="ยังไม่มีประธาน" />)

			expect(screen.getByText("ยังไม่มีประธาน")).toBeTruthy()
			expect(screen.queryByText("ตำแหน่งว่าง")).toBeNull()
		})
	})
})
