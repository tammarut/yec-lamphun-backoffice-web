import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import type { IMemberResignRepository } from "../../interfaces"
import { MemberNotFoundError } from "../get-member-by-id/get-member-by-id.errors"
import { MemberNotExpiredError } from "./resign-member.errors"
import { ResignMemberService } from "./resign-member.service"
import { DatabaseError } from "src/shared/core/errors/app-error"

describe("ResignMemberService", () => {
	let resignMemberService: ResignMemberService
	let mockRepository: MockProxy<IMemberResignRepository>

	beforeEach(() => {
		mockRepository = mock<IMemberResignRepository>()
		resignMemberService = new ResignMemberService(mockRepository)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("an EXPIRED member is resigned via the guarded write and returns ok", async () => {
				// Arrange — the pre-check reads EXPIRED; the guarded UPDATE hits.
				mockRepository.getMemberStatusById.mockResolvedValue(ok("EXPIRED"))
				mockRepository.resignMemberById.mockResolvedValue(ok(true))

				// Act
				const result = await resignMemberService.execute(7)

				// Assert — the write ran against the same id.
				expect(result.isOk()).toBe(true)
				expect(mockRepository.getMemberStatusById).toHaveBeenCalledWith(7)
				expect(mockRepository.resignMemberById).toHaveBeenCalledWith(7)
			})
		})

		describe("Unhappy cases", () => {
			test("a missing (or soft-deleted) member — pre-check 0 rows — maps to MemberNotFoundError (404)", async () => {
				// Arrange — no row from the pre-check read.
				mockRepository.getMemberStatusById.mockResolvedValue(ok(null))

				// Act
				const result = await resignMemberService.execute(999)

				// Assert — reused MemberNotFoundError message; no write attempted.
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(MemberNotFoundError)
					expect(result.error.message).toBe("not found this member id")
				}
				expect(mockRepository.resignMemberById).not.toHaveBeenCalled()
			})

			test.each(["ACTIVE", "PENDING_RENEWAL", "RESIGNED"] as const)("a %s member — pre-check non-EXPIRED — maps to MemberNotExpiredError (409)", async (status) => {
				// Arrange — the member is alive but not EXPIRED.
				mockRepository.getMemberStatusById.mockResolvedValue(ok(status))

				// Act
				const result = await resignMemberService.execute(7)

				// Assert — one message for every non-EXPIRED status; no write.
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(MemberNotExpiredError)
					expect(result.error.message).toBe(MemberNotExpiredError.DEFAULT_MESSAGE)
				}
				expect(mockRepository.resignMemberById).not.toHaveBeenCalled()
			})

			test("the lost race — guarded UPDATE affects 0 rows after an EXPIRED pre-check — maps to MemberNotExpiredError (409)", async () => {
				// Arrange — the member flips to a non-EXPIRED status between the
				// pre-check and the write; the guarded UPDATE matches 0 rows.
				mockRepository.getMemberStatusById.mockResolvedValue(ok("EXPIRED"))
				mockRepository.resignMemberById.mockResolvedValue(ok(false))

				// Act
				const result = await resignMemberService.execute(7)

				// Assert — same single message; the transition never silently passed.
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(MemberNotExpiredError)
					expect(result.error.message).toBe(MemberNotExpiredError.DEFAULT_MESSAGE)
				}
			})

			test("a pre-check read failure maps to the shared DatabaseError (500)", async () => {
				// Arrange — the status read itself fails.
				mockRepository.getMemberStatusById.mockResolvedValue(err(new DatabaseError("connection refused")))

				// Act
				const result = await resignMemberService.execute(7)

				// Assert — infra error propagates as DatabaseError; no write.
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(DatabaseError)
				}
				expect(mockRepository.resignMemberById).not.toHaveBeenCalled()
			})

			test("a guarded-write failure maps to the shared DatabaseError (500)", async () => {
				// Arrange — the pre-check passes but the UPDATE fails.
				mockRepository.getMemberStatusById.mockResolvedValue(ok("EXPIRED"))
				mockRepository.resignMemberById.mockResolvedValue(err(new DatabaseError("statement timeout")))

				// Act
				const result = await resignMemberService.execute(7)

				// Assert
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(DatabaseError)
				}
			})
		})
	})
})
