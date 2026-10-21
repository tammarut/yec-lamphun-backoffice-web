import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { countFilledNodes, OrgTree } from "src/modules/organization/components/org-tree"
import { makeCommitteeNode, makeVacantNode } from "src/modules/organization/components/make-committee-node.fixture"
import type { ExecutiveCommitteeNode } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"

afterEach(() => {
	cleanup()
})

/**
 * President with a secretary chain (ผู้ช่วยเลขานุการ below), a legal
 * department (two กรรมการฝ่าย below), two same-position advisors, and one
 * vacant department whose committee member must still render beneath it.
 */
function makeFixtureTree(): ExecutiveCommitteeNode {
	return makeCommitteeNode({
		children: [
			makeCommitteeNode({
				id: 2,
				position: "เลขาธิการ",
				first_name_th: "ประเสริฐ",
				nickname: "เลขา",
				children: [makeCommitteeNode({ id: 3, position: "ผู้ช่วยเลขานุการ", first_name_th: "ป้าง", nickname: "ป้าง" })],
			}),
			makeCommitteeNode({
				id: 4,
				position: "รองประธานฝ่ายกฎหมาย",
				first_name_th: "วิเศษ",
				nickname: "เศษ",
				children: [
					makeCommitteeNode({ id: 5, position: "กรรมการฝ่ายกฎหมาย", first_name_th: "มานะ", nickname: "หนุ่ย" }),
					makeCommitteeNode({ id: 6, position: "กรรมการฝ่ายกฎหมาย", first_name_th: "มานี", nickname: "แมน" }),
				],
			}),
			makeCommitteeNode({ id: 7, position: "คณะที่ปรึกษา", first_name_th: "ที่ปรึกษา", nickname: "กูรู" }),
			makeCommitteeNode({ id: 8, position: "คณะที่ปรึกษา", first_name_th: "ผู้ทรงคุณ", nickname: "วิศว์" }),
			makeVacantNode({
				position: "รองประธานฝ่ายไอที",
				children: [makeCommitteeNode({ id: 9, position: "กรรมการฝ่ายไอที", first_name_th: "ไอที", nickname: "เทค" })],
			}),
		],
	})
}

describe("OrgTree", () => {
	describe("Happy cases", () => {
		it("renders the President holder card at the root", () => {
			render(<OrgTree root={makeFixtureTree()} />)

			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy()
			expect(screen.getByText("ประธาน")).toBeTruthy()
		})

		it("renders one column per distinct child position, labels taken from the data", () => {
			const { container } = render(<OrgTree root={makeFixtureTree()} />)

			const columns = container.querySelectorAll('[data-slot="org-tree-column"]')
			expect(columns).toHaveLength(4)
			// A column label pill carries the position name verbatim from the data
			// (the holder card repeats it as its own position line, hence getAll).
			for (const label of ["เลขาธิการ", "รองประธานฝ่ายกฎหมาย", "คณะที่ปรึกษา", "รองประธานฝ่ายไอที"]) {
				expect(screen.getAllByText(label).length).toBeGreaterThan(0)
			}
			expect([...container.querySelectorAll('[data-slot="org-tree-column-label"]')].map((pill) => pill.textContent)).toEqual([
				"เลขาธิการ",
				"รองประธานฝ่ายกฎหมาย",
				"คณะที่ปรึกษา",
				"รองประธานฝ่ายไอที",
			])
		})

		it("groups same-position children into one column with both holder cards", () => {
			const { container } = render(<OrgTree root={makeFixtureTree()} />)

			const advisorColumn = [...container.querySelectorAll('[data-slot="org-tree-column"]')].find((column) => column.textContent?.includes("คณะที่ปรึกษา"))
			expect(advisorColumn).toBeTruthy()
			expect(advisorColumn?.querySelectorAll('[data-slot="person-card"]')).toHaveLength(2)
		})

		it("stacks descendants beneath their column at their true depth", () => {
			render(<OrgTree root={makeFixtureTree()} />)

			expect(screen.getByText("นายป้าง ใจดี")).toBeTruthy() // ผู้ช่วยเลขานุการ
			expect(screen.getByText("นายมานะ ใจดี")).toBeTruthy() // กรรมการฝ่ายกฎหมาย
			expect(screen.getByText("นายมานี ใจดี")).toBeTruthy()
		})

		it("renders a vacant child as a dashed placeholder while its descendants still appear", () => {
			const { container } = render(<OrgTree root={makeFixtureTree()} />)

			const vacantCards = [...container.querySelectorAll('[data-slot="vacant-position-card"]')]
			expect(vacantCards.map((card) => card.textContent)).toEqual(["รองประธานฝ่ายไอที"])
			expect(screen.getByText("นายไอที ใจดี")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("never renders a person card for a vacant node (no null names leak)", () => {
			render(<OrgTree root={makeVacantNode({ children: [] })} />)

			expect(screen.queryByText("นายสมชาย ใจดี")).toBeNull()
		})
	})
})

describe("countFilledNodes", () => {
	describe("Happy cases", () => {
		it("counts every filled node in the fixture tree, vacancies excluded", () => {
			expect(countFilledNodes(makeFixtureTree())).toBe(9)
		})

		it("counts a lone president as one", () => {
			expect(countFilledNodes(makeCommitteeNode())).toBe(1)
		})
	})

	describe("Unhappy cases", () => {
		it("never counts vacant placeholders", () => {
			const tree = makeCommitteeNode({
				children: [makeVacantNode({ children: [makeVacantNode({ position: "ผู้ช่วยเลขานุการ" })] })],
			})
			expect(countFilledNodes(tree)).toBe(1)
		})
	})
})
