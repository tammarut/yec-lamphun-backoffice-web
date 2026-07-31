import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMemberRepository } from "../../interfaces"
import { DeleteMemberService } from "./delete-member.service"

describe("DeleteMemberService", () => {
	let service: DeleteMemberService
	let mockRepo: MockProxy<IMemberRepository>

	beforeEach(() => {
		// Arrange (shared setup)
		mockRepo = mock<IMemberRepository>()
		service = new DeleteMemberService(mockRepo)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("returns ok and delegates the cascade soft-delete to the repository", async () => {
				// Arrange — repository's transactional cascade succeeds.
				mockRepo.softDeleteMember.mockResolvedValue(ok(undefined))

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isOk()).toBe(true)
				expect(mockRepo.softDeleteMember).toHaveBeenCalledTimes(1)
				expect(mockRepo.softDeleteMember).toHaveBeenCalledWith(101)
			})
		})

		describe("Unhappy cases", () => {
			test("propagates the DatabaseError when the repository transaction fails", async () => {
				// Arrange — the atomic cascade transaction rolls back.
				mockRepo.softDeleteMember.mockResolvedValue(err(new DatabaseError("Member deletion transaction failed")))

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
