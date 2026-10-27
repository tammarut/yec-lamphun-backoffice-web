import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"

import type { IAnnualMembershipExpiryRepository } from "../../interfaces"
import { computeRenewalSeasonBoundary } from "./renewal-season"
import { AnnualMembershipExpiryService } from "./annual-membership-expiry.service"

// Fixed clock: 1 December 2026, 09:00 Bangkok — the season is open, so the
// boundary must be 2027-01-01T00:00:00.000Z (UTC midnight of the opening
// Membership Year).
const FIXED_NOW = new Date("2026-12-01T02:00:00.000Z")
const FIXED_BOUNDARY = new Date("2027-01-01T00:00:00.000Z")

describe("AnnualMembershipExpiryService", () => {
	let service: AnnualMembershipExpiryService
	let mockRepo: MockProxy<IAnnualMembershipExpiryRepository>

	beforeEach(() => {
		mockRepo = mock<IAnnualMembershipExpiryRepository>()
		service = new AnnualMembershipExpiryService(mockRepo, () => FIXED_NOW)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("derives the boundary from the injected now and returns the expired count from the expiry write", async () => {
				mockRepo.expireMembersDueForAnnualExpiry.mockResolvedValue(ok(7))

				const result = await service.execute({ dryRun: false })

				expect(result.isOk()).toBe(true)
				expect(mockRepo.expireMembersDueForAnnualExpiry).toHaveBeenCalledWith(FIXED_BOUNDARY)
				expect(mockRepo.countMembersDueForAnnualExpiry).not.toHaveBeenCalled()
				expect(result._unsafeUnwrap()).toBe(7)
			})

			test("dry-run routes to the count-only port and performs no write", async () => {
				mockRepo.countMembersDueForAnnualExpiry.mockResolvedValue(ok(2))

				const result = await service.execute({ dryRun: true })

				expect(result.isOk()).toBe(true)
				expect(mockRepo.countMembersDueForAnnualExpiry).toHaveBeenCalledWith(FIXED_BOUNDARY)
				expect(mockRepo.expireMembersDueForAnnualExpiry).not.toHaveBeenCalled()
				expect(result._unsafeUnwrap()).toBe(2)
			})

			test("the derived boundary is the renewal-season boundary of the injected now", () => {
				expect(FIXED_BOUNDARY.toISOString()).toBe(computeRenewalSeasonBoundary(FIXED_NOW).toISOString())
			})
		})

		describe("Unhappy cases", () => {
			test("maps an expiry-write repository failure to the shared database error", async () => {
				mockRepo.expireMembersDueForAnnualExpiry.mockResolvedValue(err(new DatabaseError("expiry write failed")))

				const result = await service.execute({ dryRun: false })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})

			test("maps a dry-run count failure to the shared database error", async () => {
				mockRepo.countMembersDueForAnnualExpiry.mockResolvedValue(err(new DatabaseError("count failed")))

				const result = await service.execute({ dryRun: true })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
