import { SQL } from "bun"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseClient } from "src/shared/lib/db/database-client"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMemberRepository } from "../../interfaces"
import { DeleteMemberService } from "./delete-member.service"

describe("DeleteMemberService", () => {
	let service: DeleteMemberService
	let mockRepo: MockProxy<IMemberRepository>
	let mockDbClient: MockProxy<DatabaseClient>
	const fakeTx = Symbol("tx") as unknown as SQL

	beforeEach(() => {
		// Arrange (shared setup) — the service owns the transaction (ADR-0023);
		// the mock tx handle flows through so every step is asserted against it.
		mockRepo = mock<IMemberRepository>()
		mockDbClient = mock<DatabaseClient>()
		mockDbClient.transaction.mockImplementation(async (callback) => {
			return await callback(fakeTx)
		})
		service = new DeleteMemberService(mockDbClient, mockRepo)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("locks the business first, then runs the cascade steps inside one transaction", async () => {
				// Arrange — business has other live members; count wins.
				mockRepo.findLiveBusinessIdForCascade.mockResolvedValue(7)
				mockRepo.countLiveMembersByBusinessId.mockResolvedValue(2)

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isOk()).toBe(true)
				expect(mockDbClient.transaction).toHaveBeenCalledTimes(1)
				expect(mockRepo.findLiveBusinessIdForCascade).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.softDeleteMemberDocuments).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.softDeleteMembershipRenewals).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.softDeleteMemberRow).toHaveBeenCalledWith(fakeTx, 101)
				// Lock precedes the soft-deletes: the cascade gate must observe the
				// live business before anything in the transaction changes.
				expect(mockRepo.findLiveBusinessIdForCascade.mock.invocationCallOrder[0]).toBeLessThan(mockRepo.softDeleteMemberDocuments.mock.invocationCallOrder[0]!)
			})

			test("keeps the business when other live members remain linked", async () => {
				// Arrange — 2 OTHER live members still link to business 7.
				mockRepo.findLiveBusinessIdForCascade.mockResolvedValue(7)
				mockRepo.countLiveMembersByBusinessId.mockResolvedValue(2)

				// Act
				const result = await service.execute(101)

				// Assert — cascade decision: business survives.
				expect(result.isOk()).toBe(true)
				expect(mockRepo.countLiveMembersByBusinessId).toHaveBeenCalledWith(fakeTx, 7, 101)
				expect(mockRepo.softDeleteBusinessById).not.toHaveBeenCalled()
			})

			test("soft-deletes the business when the deleted member held the last live link", async () => {
				// Arrange — no other live member links to business 7.
				mockRepo.findLiveBusinessIdForCascade.mockResolvedValue(7)
				mockRepo.countLiveMembersByBusinessId.mockResolvedValue(0)

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isOk()).toBe(true)
				expect(mockRepo.softDeleteBusinessById).toHaveBeenCalledTimes(1)
				expect(mockRepo.softDeleteBusinessById).toHaveBeenCalledWith(fakeTx, 7)
			})

			test("re-delete is idempotent: no live business row → skips the cascade decision", async () => {
				// Arrange — business already soft-deleted (or absent): the lock finds
				// nothing, so the member's own rows are still (no-op) soft-deleted but
				// the count and business delete never run.
				mockRepo.findLiveBusinessIdForCascade.mockResolvedValue(null)

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isOk()).toBe(true)
				expect(mockRepo.softDeleteMemberDocuments).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.softDeleteMembershipRenewals).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.softDeleteMemberRow).toHaveBeenCalledWith(fakeTx, 101)
				expect(mockRepo.countLiveMembersByBusinessId).not.toHaveBeenCalled()
				expect(mockRepo.softDeleteBusinessById).not.toHaveBeenCalled()
			})
		})

		describe("Unhappy cases", () => {
			test("propagates the DatabaseError when a cascade step fails inside the transaction", async () => {
				// Arrange — a step throws inside the tx: the whole transaction rolls back.
				mockRepo.findLiveBusinessIdForCascade.mockResolvedValue(7)
				mockRepo.softDeleteMemberDocuments.mockRejectedValue(new DatabaseError("documents soft-delete failed"))

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
				expect(mockRepo.softDeleteMembershipRenewals).not.toHaveBeenCalled()
			})

			test("wraps a foreign transaction failure as DatabaseError", async () => {
				// Arrange — the transaction itself fails outside the repository steps.
				mockDbClient.transaction.mockRejectedValue(new Error("connection reset"))

				// Act
				const result = await service.execute(101)

				// Assert
				expect(result.isErr()).toBe(true)
				const error = result._unsafeUnwrapErr()
				expect(error).toBeInstanceOf(DatabaseError)
				expect(error.message).toBe("Member deletion transaction failed")
			})
		})
	})
})
