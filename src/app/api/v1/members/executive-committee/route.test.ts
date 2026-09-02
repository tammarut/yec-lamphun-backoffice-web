import { err, ok } from "neverthrow"
import { NextResponse } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { GetExecutiveCommitteeService } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Mock container module BEFORE importing the route.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

// Import route AFTER mocks.
import { GET } from "./route"

// The spec's own example tree (with `children` spelled correctly).
const exampleTree = {
	id: 1,
	profile_avatar: "https://public.example/members/profile_avatars/president.png",
	title_name_th: "นาย",
	first_name_th: "สมชาย",
	last_name_th: "ใจดี",
	nickname: "cham",
	position: "ประธาน YEC Lamphun",
	business_name: "บริษัท วี ฟู้ดส์ (ประเทศไทย) จำกัด",
	children: [
		{
			id: 4,
			profile_avatar: null,
			title_name_th: "นางสาว",
			first_name_th: "เลขา",
			last_name_th: "ตัวหลัก",
			nickname: "ส้ม",
			position: "เลขาธิการ",
			business_name: "บริษัทส้มหวาน",
			children: [
				{
					id: 5,
					profile_avatar: null,
					title_name_th: "นาย",
					first_name_th: "เลขา",
					last_name_th: "ตัวรอง",
					nickname: "รอง",
					position: "ผู้ช่วยเลขาธิการ",
					business_name: null,
					children: [],
				},
			],
		},
	],
}

describe("GET /api/v1/members/executive-committee", () => {
	let mockService: ReturnType<typeof mock<GetExecutiveCommitteeService>>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<GetExecutiveCommitteeService>()

		// Default happy stub: the spec's example tree.
		mockService.execute.mockResolvedValue(ok(exampleTree))

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.GET_EXECUTIVE_COMMITTEE_SERVICE) {
				return mockService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("returns 200 with the President-rooted tree", async () => {
			const response = await GET()

			expect(response).toBeInstanceOf(NextResponse)
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(exampleTree)
		})

		it("returns 200 with body null when there is no live PRESIDENT holder", async () => {
			mockService.execute.mockResolvedValue(ok(null))

			const response = await GET()

			expect(response.status).toBe(200)
			expect(await response.json()).toBeNull()
		})

		it("PUBLIC (no cookie): serves the tree without resolving any auth — no 401 path", async () => {
			const response = await GET()

			expect(response.status).toBe(200)
			expect(vi.mocked(container.resolve)).toHaveBeenCalledWith(REGISTER_KEY.GET_EXECUTIVE_COMMITTEE_SERVICE)
			expect(vi.mocked(container.resolve)).not.toHaveBeenCalledWith(REGISTER_KEY.AUTH_SERVICE)
		})
	})

	describe("Unhappy cases", () => {
		it("returns 500 on a DatabaseError (no leaky details)", async () => {
			mockService.execute.mockResolvedValue(err(new DatabaseError("boom")))
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const response = await GET()

			expect(response.status).toBe(500)
			const json = (await response.json()) as ResponseBodyError
			expect(json.error_message).toBe("Internal Server Error")
			consoleSpy.mockRestore()
		})
	})
})
