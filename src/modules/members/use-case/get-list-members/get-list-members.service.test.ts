import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import { InvalidCursorError } from "./get-list-members.errors"
import type { ListMembersFilter, MemberListPage, MemberListRow } from "./get-list-members.types"
import { GetListMembersService } from "./get-list-members.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

// Canonical filter used across cases. Variants override individual fields.
const baseFilter: ListMembersFilter = {
	limit: 10,
	cursor: null,
	statuses: null,
	search: null,
	sortBy: "created_at",
	sortOrder: "desc",
}

// Two representative rows. Row A has an avatar key (URL gets resolved); row B
// has a null avatar (passes through as null without touching the URL service).
const rowA: MemberListRow = {
	id: 2,
	registrationType: "INDIVIDUAL",
	titleNameTh: "นาย",
	firstNameTh: "สมชาย",
	lastNameTh: "ใจดี",
	nickname: "cham",
	phoneNo: "0812345678",
	email: "a@example.com",
	lineId: "a.line",
	positionCode: "GENERAL_MEMBER",
	status: "ACTIVE",
	profileAvatar: "members/profile_avatars/a.png",
	businessName: "V Foods",
	businessDescription: "desc A",
}
const rowB: MemberListRow = {
	id: 1,
	registrationType: "INDIVIDUAL",
	titleNameTh: "นาย",
	firstNameTh: "สมหญิง",
	lastNameTh: "รักดี",
	nickname: "y",
	phoneNo: "0898765432",
	email: null,
	lineId: null,
	positionCode: "PRESIDENT",
	status: "EXPIRED",
	profileAvatar: null,
	businessName: "B Co",
	businessDescription: "desc B",
}

describe("GetListMembersService", () => {
	let service: GetListMembersService
	let mockRepo: MockProxy<IMemberRepository>
	let mockUrlService: MockProxy<MemberFileUrlService>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		mockUrlService = mock<MemberFileUrlService>()
		// Default happy stub: avatar URL resolves to a fixed public URL.
		mockUrlService.resolveProfileAvatarUrl.mockImplementation((path) => (path === null ? null : `https://public.example/${path}`))
		service = new GetListMembersService(mockRepo, mockUrlService)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("maps rows to response DTOs, resolving avatar URLs, and threads through has_more/next_cursor", async () => {
				const page: MemberListPage = {
					rows: [rowA, rowB],
					hasMore: true,
					nextCursor: 11,
				}
				mockRepo.getListMembers.mockResolvedValue(ok(page))

				const result = await service.execute(baseFilter)

				const value = result._unsafeUnwrap()
				expect(value.has_more).toBe(true)
				expect(value.next_cursor).toBe("11") // stringified per the API contract
				expect(value.data).toHaveLength(2)
				// Row A: avatar resolved.
				expect(value.data[0]).toEqual({
					id: 2,
					profile_avatar: "https://public.example/members/profile_avatars/a.png",
					registration_type: "INDIVIDUAL",
					title_name_th: "นาย",
					first_name_th: "สมชาย",
					last_name_th: "ใจดี",
					nickname: "cham",
					phone_no: "0812345678",
					email: "a@example.com",
					line_id: "a.line",
					position: "GENERAL_MEMBER",
					status: "ACTIVE",
					business: { name: "V Foods", description: "desc A" },
				})
				// Row B: null avatar passes through as null.
				expect(value.data[1]?.profile_avatar).toBeNull()
				// resolveProfileAvatarUrl called once per row.
				expect(mockUrlService.resolveProfileAvatarUrl).toHaveBeenCalledTimes(2)
			})

			test("empty page (Q7) — data: [], has_more: false, next_cursor: null", async () => {
				const emptyPage: MemberListPage = { rows: [], hasMore: false, nextCursor: null }
				mockRepo.getListMembers.mockResolvedValue(ok(emptyPage))

				const result = await service.execute(baseFilter)

				expect(result._unsafeUnwrap()).toEqual({ data: [], has_more: false, next_cursor: null })
				expect(mockUrlService.resolveProfileAvatarUrl).not.toHaveBeenCalled()
			})

			test("final page — has_more: false, next_cursor: null even with rows present", async () => {
				const finalPage: MemberListPage = { rows: [rowA], hasMore: false, nextCursor: null }
				mockRepo.getListMembers.mockResolvedValue(ok(finalPage))

				const result = await service.execute(baseFilter)

				expect(result._unsafeUnwrap()).toEqual({
					data: [expect.objectContaining({ id: 2 })],
					has_more: false,
					next_cursor: null,
				})
			})

			test("forwards the filter to the repository unchanged", async () => {
				const filter: ListMembersFilter = { ...baseFilter, cursor: 5, statuses: ["ACTIVE"], search: "สม", sortBy: "first_name_th", sortOrder: "asc" }
				mockRepo.getListMembers.mockResolvedValue(ok({ rows: [], hasMore: false, nextCursor: null }))

				await service.execute(filter)

				expect(mockRepo.getListMembers).toHaveBeenCalledWith(filter)
			})
		})

		describe("Unhappy cases", () => {
			test("propagates InvalidCursorError (deleted anchor, Q3b) — route maps to 400", async () => {
				mockRepo.getListMembers.mockResolvedValue(err(new InvalidCursorError()))

				const result = await service.execute({ ...baseFilter, cursor: 999 })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(InvalidCursorError)
			})

			test("propagates DatabaseError (infra) — route maps to 500", async () => {
				mockRepo.getListMembers.mockResolvedValue(err(new DatabaseError("boom")))

				const result = await service.execute(baseFilter)

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
