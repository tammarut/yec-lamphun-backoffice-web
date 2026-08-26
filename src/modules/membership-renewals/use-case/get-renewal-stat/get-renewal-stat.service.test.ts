import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IMembershipRenewalRepository } from "../../interfaces"
import type { RenewalStatRow } from "./get-renewal-stat.types"
import { GetRenewalStatService } from "./get-renewal-stat.service"

// The spec's own example counts — a representative non-zero row.
const statRow: RenewalStatRow = {
	totalExpiredMembers: 5,
	totalPendingReviewMembers: 1,
	totalApprovedMembers: 6,
}

describe("GetRenewalStatService", () => {
	let service: GetRenewalStatService
	let mockRepo: MockProxy<IMembershipRenewalRepository>

	beforeEach(() => {
		mockRepo = mock<IMembershipRenewalRepository>()
		service = new GetRenewalStatService(mockRepo)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("maps the repo row to the snake_case response DTO", async () => {
				mockRepo.getRenewalStat.mockResolvedValue(ok(statRow))

				const result = await service.execute()

				expect(result._unsafeUnwrap()).toEqual({
					total_expired_members: 5,
					total_pending_review_members: 1,
					total_approved_members: 6,
				})
			})

			test("zero state — an empty members table maps to all-zero counts", async () => {
				mockRepo.getRenewalStat.mockResolvedValue(ok({ totalExpiredMembers: 0, totalPendingReviewMembers: 0, totalApprovedMembers: 0 }))

				const result = await service.execute()

				expect(result._unsafeUnwrap()).toEqual({
					total_expired_members: 0,
					total_pending_review_members: 0,
					total_approved_members: 0,
				})
			})
		})

		describe("Unhappy cases", () => {
			test("propagates DatabaseError (infra) — route maps to 500", async () => {
				mockRepo.getRenewalStat.mockResolvedValue(err(new DatabaseError("boom")))

				const result = await service.execute()

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
