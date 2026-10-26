import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { computeRenewalSeasonBoundary } from "src/modules/shared/membership/renewal-season"
import { DatabaseError } from "src/shared/core/errors/app-error"

import type { IMemberRepository } from "../../interfaces"
import { MemberExpirySweepService } from "./member-expiry-sweep.service"

// Fixed clock: 1 December 2026, 09:00 Bangkok — the season is open, so the
// boundary must be 2027-01-01T00:00:00.000Z (UTC midnight of the opening
// Membership Year).
const FIXED_NOW = new Date("2026-12-01T02:00:00.000Z")
const FIXED_BOUNDARY = new Date("2027-01-01T00:00:00.000Z")

describe("MemberExpirySweepService", () => {
	let service: MemberExpirySweepService
	let mockRepo: MockProxy<IMemberRepository>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		service = new MemberExpirySweepService(mockRepo, () => FIXED_NOW)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("derives the boundary from the injected now and returns the expired count from the sweep write", async () => {
				mockRepo.expireMembersDueForExpiry.mockResolvedValue(ok(7))

				const result = await service.execute({ dryRun: false })

				expect(result.isOk()).toBe(true)
				expect(mockRepo.expireMembersDueForExpiry).toHaveBeenCalledWith(FIXED_BOUNDARY)
				expect(mockRepo.countMembersDueForExpiry).not.toHaveBeenCalled()
				expect(result._unsafeUnwrap()).toEqual({ boundary: FIXED_BOUNDARY, expiredCount: 7, dryRun: false })
			})

			test("dry-run routes to the count-only port and performs no write", async () => {
				mockRepo.countMembersDueForExpiry.mockResolvedValue(ok(2))

				const result = await service.execute({ dryRun: true })

				expect(result.isOk()).toBe(true)
				expect(mockRepo.countMembersDueForExpiry).toHaveBeenCalledWith(FIXED_BOUNDARY)
				expect(mockRepo.expireMembersDueForExpiry).not.toHaveBeenCalled()
				expect(result._unsafeUnwrap()).toEqual({ boundary: FIXED_BOUNDARY, expiredCount: 2, dryRun: true })
			})

			test("the derived boundary is the renewal-season boundary of the injected now", () => {
				expect(FIXED_BOUNDARY.toISOString()).toBe(computeRenewalSeasonBoundary(FIXED_NOW).toISOString())
			})
		})

		describe("Unhappy cases", () => {
			test("maps a sweep-write repository failure to the shared database error", async () => {
				mockRepo.expireMembersDueForExpiry.mockResolvedValue(err(new DatabaseError("sweep write failed")))

				const result = await service.execute({ dryRun: false })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})

			test("maps a dry-run count failure to the shared database error", async () => {
				mockRepo.countMembersDueForExpiry.mockResolvedValue(err(new DatabaseError("count failed")))

				const result = await service.execute({ dryRun: true })

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
