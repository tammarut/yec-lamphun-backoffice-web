import { err, ok } from "neverthrow"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { IDashboardRepository } from "../../interfaces"
import type { DashboardMemberStatusCountsRow, MemberCountByYearRow } from "./get-dashboard-stat.types"
import { GetDashboardStatService } from "./get-dashboard-stat.service"

describe("GetDashboardStatService", () => {
	let service: GetDashboardStatService
	let mockRepository: MockProxy<IDashboardRepository>

	const memberStatusCounts: DashboardMemberStatusCountsRow = {
		totalMembers: 12,
		totalActiveMembers: 5,
		totalExpiredMembers: 4,
	}

	beforeEach(() => {
		mockRepository = mock<IDashboardRepository>()
		service = new GetDashboardStatService(mockRepository)

		// Frozen clock in mid-year, far from any year boundary: 2026-08-30
		// 00:00 UTC == 07:00 Bangkok — both clocks agree on 2026.
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-08-30T00:00:00.000Z"))

		mockRepository.getMemberStatusCounts.mockResolvedValue(ok(memberStatusCounts))
		mockRepository.getBusinessCount.mockResolvedValue(ok(10))
		mockRepository.getMemberCountsByYear.mockResolvedValue(ok([]))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			it("maps the three repo reads to the snake_case DTO", async () => {
				const result = await service.execute(5)

				const response = result._unsafeUnwrap()
				expect(response.total_members).toBe(12)
				expect(response.total_active_members).toBe(5)
				expect(response.total_expired_members).toBe(4)
				expect(response.total_businesses).toBe(10)
			})

			it("zero-fills the lookback window and fills actual years from repo rows", async () => {
				const rows: MemberCountByYearRow[] = [
					{ year: 2026, count: 8 },
					{ year: 2024, count: 6 },
				]
				mockRepository.getMemberCountsByYear.mockResolvedValue(ok(rows))

				const result = await service.execute(5)

				const response = result._unsafeUnwrap()
				// Window 2022..2026 (5 keys), 2024 and 2026 filled, the rest 0.
				expect(response.total_members_each_year).toEqual({
					"2022": 0,
					"2023": 0,
					"2024": 6,
					"2025": 0,
					"2026": 8,
				})
			})

			it("queries the repo with minYear = currentYear - lookbackYears + 1", async () => {
				await service.execute(7)

				expect(mockRepository.getMemberCountsByYear).toHaveBeenCalledWith(2020)
			})

			it("lookback 1 yields a single-key window (the current year only)", async () => {
				mockRepository.getMemberCountsByYear.mockResolvedValue(ok([{ year: 2026, count: 3 }]))

				const result = await service.execute(1)

				const response = result._unsafeUnwrap()
				expect(response.total_members_each_year).toEqual({ "2026": 3 })
				expect(mockRepository.getMemberCountsByYear).toHaveBeenCalledWith(2026)
			})

			it("pins the current year to Asia/Bangkok — a UTC New Year's Eve instant is already next year in Bangkok", async () => {
				// 2025-12-31 17:30 UTC == 2026-01-01 00:30 Bangkok. Under a
				// UTC policy the window would be 2021..2025; Bangkok gives 2022..2026.
				vi.setSystemTime(new Date("2025-12-31T17:30:00.000Z"))

				const result = await service.execute(5)

				const response = result._unsafeUnwrap()
				expect(Object.keys(response.total_members_each_year)).toEqual(["2022", "2023", "2024", "2025", "2026"])
				expect(mockRepository.getMemberCountsByYear).toHaveBeenCalledWith(2022)
			})

			it("defensively ignores repo rows outside the window", async () => {
				const rows: MemberCountByYearRow[] = [
					{ year: 2026, count: 8 },
					{ year: 2019, count: 99 },
					{ year: 2030, count: 99 },
				]
				mockRepository.getMemberCountsByYear.mockResolvedValue(ok(rows))

				const result = await service.execute(2)

				const response = result._unsafeUnwrap()
				expect(response.total_members_each_year).toEqual({ "2025": 0, "2026": 8 })
			})
		})

		describe("Unhappy cases", () => {
			it("propagates the error and skips the remaining reads when the status-counts query fails", async () => {
				mockRepository.getMemberStatusCounts.mockResolvedValue(err(new DatabaseError("boom-counts")))

				const result = await service.execute(5)

				expect(result._unsafeUnwrapErr().message).toBe("boom-counts")
				expect(mockRepository.getBusinessCount).not.toHaveBeenCalled()
				expect(mockRepository.getMemberCountsByYear).not.toHaveBeenCalled()
			})

			it("propagates the error when the business-count query fails", async () => {
				mockRepository.getBusinessCount.mockResolvedValue(err(new DatabaseError("boom-business")))

				const result = await service.execute(5)

				expect(result._unsafeUnwrapErr().message).toBe("boom-business")
				expect(mockRepository.getMemberCountsByYear).not.toHaveBeenCalled()
			})

			it("propagates the error when the yearly query fails", async () => {
				mockRepository.getMemberCountsByYear.mockResolvedValue(err(new DatabaseError("boom-yearly")))

				const result = await service.execute(5)

				expect(result._unsafeUnwrapErr().message).toBe("boom-yearly")
			})
		})
	})
})
