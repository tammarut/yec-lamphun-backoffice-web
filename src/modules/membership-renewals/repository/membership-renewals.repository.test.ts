import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseClient } from "src/shared/lib/db/database-client"
import { MembershipRenewalsRepository } from "./membership-renewals.repository"

describe("MembershipRenewalsRepository.getMemberStatusesForRenewal", () => {
	let repository: MembershipRenewalsRepository
	let mockDbClient: MockProxy<DatabaseClient>

	beforeEach(() => {
		// Arrange (shared setup)
		mockDbClient = mock<DatabaseClient>()
		repository = new MembershipRenewalsRepository(mockDbClient)
	})

	describe("Happy cases", () => {
		test("empty memberIds -> ok([]) WITHOUT touching the database connection", async () => {
			// Act
			const result = await repository.getMemberStatusesForRenewal([])

			// Assert — the empty-CSV guard short-circuits: a bound "" would fail the
			// bigint[] cast (pg 22P02 via string_to_array('', ',')), so the method
			// must never reach the driver with an empty array.
			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([])
			expect(mockDbClient.getRwConnection).not.toHaveBeenCalled()
		})
	})
})
