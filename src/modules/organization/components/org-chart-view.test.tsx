import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { OrgChartView } from "src/modules/organization/components/org-chart-view"
import { makeCommitteeNode, makeVacantNode } from "src/modules/organization/components/make-committee-node.fixture"
import { makeGeneralMember } from "src/modules/organization/components/make-general-member.fixture"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

type ViewOptions = {
	committee: () => Response
	/** Cursor-aware router for the general-members list GET. */
	members: (cursor: string | null) => Response
}

/**
 * Render OrgChartView against a stubbed fetch routing the two independent
 * queries. No SessionProvider — the org page has no admin-gated content.
 */
function renderView(options: ViewOptions) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input)
		if (url === "/api/v1/members/executive-committee") {
			return options.committee()
		}
		if (url.startsWith("/api/v1/members?")) {
			return options.members(new URLSearchParams(url.split("?")[1] ?? "").get("cursor"))
		}
		return jsonResponse(404, { error_message: "Not Found" })
	})
	vi.stubGlobal("fetch", fetchMock)

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	})
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	render(<OrgChartView />, { wrapper })
	return { fetchMock, queryClient }
}

/** President + one filled child + one vacant child-with-descendant → badge 3 คน. */
function committeeWithThreeFilled() {
	return makeCommitteeNode({
		children: [
			makeCommitteeNode({ id: 2, position: "เลขาธิการ", first_name_th: "ประเสริฐ", nickname: "เลขา" }),
			makeVacantNode({ position: "รองประธานฝ่ายกฎหมาย", children: [makeCommitteeNode({ id: 3, position: "กรรมการฝ่ายกฎหมาย", first_name_th: "มานะ", nickname: "หนุ่ย" })] }),
		],
	})
}

function membersPage(members: MemberListItemResponse[], hasMore: boolean) {
	return { data: members, has_more: hasMore, next_cursor: hasMore && members.length > 0 ? String(members[members.length - 1]?.id) : null }
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("OrgChartView", () => {
	describe("Happy cases", () => {
		it("renders the committee tree with the filled-count badge and the general-members chips", async () => {
			renderView({
				committee: () => jsonResponse(200, committeeWithThreeFilled()),
				members: () => jsonResponse(200, membersPage([makeGeneralMember()], false)),
			})

			expect(await screen.findByText("3 คน")).toBeTruthy()
			expect(screen.getByText("นายสมชาย ใจดี")).toBeTruthy() // president
			expect(screen.getByText("นายสมหญิง ใจดี")).toBeTruthy() // general-member chip
			expect(screen.getByText("(หญิง)")).toBeTruthy()
			expect(screen.getByText("สมาชิกทั่วไป (General Members)")).toBeTruthy()
			expect(screen.getByText("รายชื่อสมาชิกที่ไม่ได้ดำรงตำแหน่งในคณะกรรมการ")).toBeTruthy()
		})

		it("maps the three live statuses to green, amber, and gray dots", async () => {
			renderView({
				committee: () => jsonResponse(200, committeeWithThreeFilled()),
				members: () =>
					jsonResponse(
						200,
						membersPage(
							[
								makeGeneralMember({ id: 1, status: "ACTIVE", first_name_th: "สายสีเขียว" }),
								makeGeneralMember({ id: 2, status: "PENDING_RENEWAL", first_name_th: "สายสีเหลือง" }),
								makeGeneralMember({ id: 3, status: "EXPIRED", first_name_th: "สายสีเทา" }),
							],
							false
						)
					),
			})

			expect(await screen.findByText("นายสายสีเขียว ใจดี")).toBeTruthy()
			const dots = [...document.querySelectorAll('[data-slot="member-status-dot"]')]
			expect(dots.map((dot) => dot.getAttribute("data-status"))).toEqual(["ACTIVE", "PENDING_RENEWAL", "EXPIRED"])
			expect(dots.map((dot) => dot.className)).toEqual([
				expect.stringContaining("bg-success"),
				expect.stringContaining("bg-pending"),
				expect.stringContaining("bg-muted-foreground"),
			])
		})

		it("โหลดเพิ่มเติม appends the next page and disappears when has_more is false", async () => {
			const state = { page: 0 }
			renderView({
				committee: () => jsonResponse(200, committeeWithThreeFilled()),
				members: (cursor) => {
					state.page += 1
					if (cursor === null) {
						return jsonResponse(200, membersPage([makeGeneralMember({ id: 1, first_name_th: "หนึ่ง" })], true))
					}
					return jsonResponse(200, membersPage([makeGeneralMember({ id: 2, first_name_th: "สอง" })], false))
				},
			})

			expect(await screen.findByText("นายหนึ่ง ใจดี")).toBeTruthy()
			fireEvent.click(screen.getByRole("button", { name: "โหลดเพิ่มเติม" }))

			expect(await screen.findByText("นายสอง ใจดี")).toBeTruthy()
			await waitFor(() => {
				expect(screen.queryByRole("button", { name: "โหลดเพิ่มเติม" })).toBeNull()
			})
		})

		it("renders ยังไม่มีประธาน with a 0 คน badge when the root is null", async () => {
			renderView({
				committee: () => jsonResponse(200, null),
				members: () => jsonResponse(200, membersPage([makeGeneralMember()], false)),
			})

			expect(await screen.findByText("ยังไม่มีประธาน")).toBeTruthy()
			expect(screen.getByText("0 คน")).toBeTruthy()
		})

		it("renders the empty-grid state when there are no general members", async () => {
			renderView({
				committee: () => jsonResponse(200, committeeWithThreeFilled()),
				members: () => jsonResponse(200, membersPage([], false)),
			})

			expect(await screen.findByText("ไม่มีข้อมูลสมาชิกทั่วไป")).toBeTruthy()
		})
	})

	describe("Unhappy cases", () => {
		it("a failing committee query leaves the general-members grid untouched", async () => {
			renderView({
				committee: () => jsonResponse(500, { error_message: "Internal Server Error" }),
				members: () => jsonResponse(200, membersPage([makeGeneralMember()], false)),
			})

			expect(await screen.findByText("โหลดโครงสร้างคณะกรรมการไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("นายสมหญิง ใจดี")).toBeTruthy()
		})

		it("a failing members query leaves the committee tree untouched", async () => {
			renderView({
				committee: () => jsonResponse(200, committeeWithThreeFilled()),
				members: () => jsonResponse(500, { error_message: "Internal Server Error" }),
			})

			expect(await screen.findByText("โหลดรายชื่อสมาชิกทั่วไปไม่สำเร็จ")).toBeTruthy()
			expect(screen.getByText("3 คน")).toBeTruthy()
			expect(screen.getByText("ประธาน")).toBeTruthy()
		})

		it("committee retry recovers after the endpoint heals", async () => {
			let failing = true
			renderView({
				committee: () => (failing ? jsonResponse(500, { error_message: "Internal Server Error" }) : jsonResponse(200, committeeWithThreeFilled())),
				members: () => jsonResponse(200, membersPage([makeGeneralMember()], false)),
			})

			expect(await screen.findByText("โหลดโครงสร้างคณะกรรมการไม่สำเร็จ")).toBeTruthy()

			failing = false
			fireEvent.click(screen.getByRole("button", { name: "ลองใหม่" }))
			expect(await screen.findByText("3 คน")).toBeTruthy()
		})
	})
})
