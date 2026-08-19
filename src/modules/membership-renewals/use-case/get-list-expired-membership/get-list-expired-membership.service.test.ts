import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import type { IStorageUrlResolver } from "src/modules/shared/storage/storage-url-resolver.interface"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMembershipRenewalRepository } from "../../interfaces"
import { InvalidCursorError } from "./get-list-expired-membership.errors"
import type { ExpiredMembershipListPage, ExpiredMembershipListRow, ListExpiredMembershipFilter } from "./get-list-expired-membership.types"
import { GetListExpiredMembershipService } from "./get-list-expired-membership.service"

// Canonical filter used across cases. Variants override individual fields.
const baseFilter: ListExpiredMembershipFilter = {
	limit: 10,
	cursor: null,
	search: null,
}

// Two representative rows. Row A has an avatar key (URL gets resolved); row B
// has a null avatar (passes through as null without touching the resolver).
const rowA: ExpiredMembershipListRow = {
	id: 2,
	profileAvatar: "members/profile_avatars/a.png",
	titleNameTh: "นาย",
	firstNameTh: "สมชาย",
	lastNameTh: "ใจดี",
	nickname: "cham",
	phoneNo: "0812345678",
	positionCode: "GENERAL_MEMBER",
	status: "EXPIRED",
	latestRenewalStatus: "REJECTED",
	memberSince: new Date("2019-12-20T16:45:39.000Z"),
}
const rowB: ExpiredMembershipListRow = {
	id: 1,
	profileAvatar: null,
	titleNameTh: "นางสาว",
	firstNameTh: "วิภาดา",
	lastNameTh: "รักงาน",
	nickname: "วิ",
	phoneNo: "0511223344",
	positionCode: "COMMITTEE_MEMBER",
	status: "EXPIRED",
	latestRenewalStatus: null,
	memberSince: new Date("2020-12-20T16:45:39.000Z"),
}

describe("GetListExpiredMembershipService", () => {
	let service: GetListExpiredMembershipService
	let mockRepo: MockProxy<IMembershipRenewalRepository>
	let mockUrlResolver: MockProxy<IStorageUrlResolver>

	beforeEach(() => {
		mockRepo = mock<IMembershipRenewalRepository>()
		mockUrlResolver = mock<IStorageUrlResolver>()
		// Default happy stub: avatar key resolves to a fixed public URL.
		mockUrlResolver.publicUrl.mockImplementation((key) => `https://public.example/${key}`)
		service = new GetListExpiredMembershipService(mockRepo, mockUrlResolver)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("maps rows to response DTOs, resolving avatar URLs, and threads through has_more/next_cursor", async () => {
				const page: ExpiredMembershipListPage = {
					rows: [rowA, rowB],
					hasMore: true,
					nextCursor: 11,
				}
				mockRepo.getListExpiredMembership.mockResolvedValue(ok(page))

				const result = await service.execute(baseFilter)

				const value = result._unsafeUnwrap()
				expect(value.has_more).toBe(true)
				expect(value.next_cursor).toBe("11") // stringified per the API contract
				expect(value.data).toHaveLength(2)
				// Row A: avatar key resolved via the shared resolver.
				expect(value.data[0]).toEqual({
					id: 2,
					profile_avatar: "https://public.example/members/profile_avatars/a.png",
					title_name_th: "นาย",
					first_name_th: "สมชาย",
					last_name_th: "ใจดี",
					nickname: "cham",
					phone_no: "0812345678",
					position: "GENERAL_MEMBER", // raw code, grilling Q4
					status: "EXPIRED",
					latest_renewal_status: "REJECTED", // badge signal, passed through
					member_since: "2019-12-20T16:45:39.000Z", // ISO string
				})
				// Row B: null avatar passes through as null (no resolver call); the
				// never-filed-a-renewal member's latest_renewal_status stays null.
				expect(value.data[1]?.profile_avatar).toBeNull()
				expect(value.data[1]?.latest_renewal_status).toBeNull()
				expect(value.data[1]?.member_since).toBe("2020-12-20T16:45:39.000Z")
				// publicUrl called once per non-null avatar only.
				expect(mockUrlResolver.publicUrl).toHaveBeenCalledTimes(1)
				expect(mockUrlResolver.publicUrl).toHaveBeenCalledWith("members/profile_avatars/a.png")
			})

			test("empty page — data: [], has_more: false, next_cursor: null", async () => {
				const emptyPage: ExpiredMembershipListPage = { rows: [], hasMore: false, nextCursor: null }
				mockRepo.getListExpiredMembership.mockResolvedValue(ok(emptyPage))

				const result = await service.execute(baseFilter)

				expect(result._unsafeUnwrap()).toEqual({ data: [], has_more: false, next_cursor: null })
				expect(mockUrlResolver.publicUrl).not.toHaveBeenCalled()
			})

			test("final page — has_more: false, next_cursor: null even with rows present", async () => {
				const finalPage: ExpiredMembershipListPage = { rows: [rowA], hasMore: false, nextCursor: null }
				mockRepo.getListExpiredMembership.mockResolvedValue(ok(finalPage))

				const result = await service.execute(baseFilter)

				expect(result._unsafeUnwrap()).toEqual({
					data: [expect.objectContaining({ id: 2 })],
					has_more: false,
					next_cursor: null,
				})
			})

			test("forwards the filter to the repository unchanged", async () => {
				const filter: ListExpiredMembershipFilter = { ...baseFilter, cursor: 5, search: "สม" }
				mockRepo.getListExpiredMembership.mockResolvedValue(ok({ rows: [], hasMore: false, nextCursor: null }))

				await service.execute(filter)

				expect(mockRepo.getListExpiredMembership).toHaveBeenCalledWith(filter)
			})
		})

		describe("Unhappy cases", () => {
			test("propagates InvalidCursorError (deleted anchor) — route maps to 400", async () => {
				mockRepo.getListExpiredMembership.mockResolvedValue(err(new InvalidCursorError()))

				const result = await service.execute({ ...baseFilter, cursor: 999 })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(InvalidCursorError)
			})

			test("propagates DatabaseError (infra) — route maps to 500", async () => {
				mockRepo.getListExpiredMembership.mockResolvedValue(err(new DatabaseError("boom")))

				const result = await service.execute(baseFilter)

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
