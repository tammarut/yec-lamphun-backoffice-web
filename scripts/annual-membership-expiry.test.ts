import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

const loggerSpies = vi.hoisted(() => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
}))

vi.mock("src/shared/lib/logger/logger", () => ({
	configureLogger: vi.fn(async () => undefined),
	createLogger: () => loggerSpies,
}))

import { container } from "src/modules/container"
import { computeRenewalSeasonBoundary } from "src/modules/members/use-case/annual-membership-expiry/renewal-season"
import { DatabaseError } from "src/shared/core/errors/app-error"
import type { AnnualMembershipExpiryService } from "src/modules/members/use-case/annual-membership-expiry/annual-membership-expiry.service"

import { run } from "./annual-membership-expiry"

const BOUNDARY = new Date("2027-01-01T00:00:00.000Z")

/** The log line's `boundary` is derived from the line's own `run_at`. */
function expectedBoundary(props: Record<string, unknown>): string {
	return computeRenewalSeasonBoundary(new Date(props["runAt"] as string)).toISOString()
}

describe("annual-membership-expiry script", () => {
	let mockService: MockProxy<AnnualMembershipExpiryService>

	beforeEach(() => {
		vi.clearAllMocks()
		mockService = mock<AnnualMembershipExpiryService>()
		vi.mocked(container.resolve).mockReturnValue(mockService)
	})

	describe("run", () => {
		describe("Happy cases", () => {
			test("a plain run expires due members and logs exactly one success line, exiting 0", async () => {
				mockService.execute.mockResolvedValue(ok({ boundary: BOUNDARY, expiredCount: 7, dryRun: false }))

				const exitCode = await run([])

				expect(exitCode).toBe(0)
				expect(mockService.execute).toHaveBeenCalledWith({ dryRun: false })
				expect(loggerSpies.info).toHaveBeenCalledTimes(1)
				expect(loggerSpies.error).not.toHaveBeenCalled()
				const [, props] = loggerSpies.info.mock.calls[0] as [string, Record<string, unknown>]
				expect(props).toMatchObject({ expiredCount: 7, dryRun: false })
				expect(props["boundary"]).toBe(expectedBoundary(props))
				expect(props["durationMs"]).toBeGreaterThanOrEqual(0)
				expect(typeof props["runAt"]).toBe("string")
			})

			test("--dry-run reaches the service as dryRun=true and the log line carries dry_run", async () => {
				mockService.execute.mockResolvedValue(ok({ boundary: BOUNDARY, expiredCount: 2, dryRun: true }))

				const exitCode = await run(["--dry-run"])

				expect(exitCode).toBe(0)
				expect(mockService.execute).toHaveBeenCalledWith({ dryRun: true })
				const [, props] = loggerSpies.info.mock.calls[0] as [string, Record<string, unknown>]
				expect(props).toMatchObject({ expiredCount: 2, dryRun: true })
				expect(props["boundary"]).toBe(expectedBoundary(props))
			})
		})

		describe("Unhappy cases", () => {
			test("an unknown CLI argument aborts with exit 1 and never reaches the service", async () => {
				const exitCode = await run(["--dryrun"])

				expect(exitCode).toBe(1)
				expect(mockService.execute).not.toHaveBeenCalled()
				expect(loggerSpies.error).toHaveBeenCalledTimes(1)
				expect(loggerSpies.info).not.toHaveBeenCalled()
				const [, props] = loggerSpies.error.mock.calls[0] as [string, Record<string, unknown>]
				expect(props).toMatchObject({ errorCode: "INVALID_ARGUMENTS", expiredCount: null, dryRun: false })
				expect(props["errorMessage"]).toContain("--dryrun")
			})

			test("a service failure logs exactly one error line and exits 1", async () => {
				mockService.execute.mockResolvedValue(err(new DatabaseError("expiry write failed")))

				const exitCode = await run([])

				expect(exitCode).toBe(1)
				expect(loggerSpies.error).toHaveBeenCalledTimes(1)
				expect(loggerSpies.info).not.toHaveBeenCalled()
				const [, props] = loggerSpies.error.mock.calls[0] as [string, Record<string, unknown>]
				expect(props).toMatchObject({ errorMessage: "expiry write failed", errorCode: "DATABASE_ERROR", expiredCount: null, dryRun: false })
				expect(props["boundary"]).toBe(expectedBoundary(props))
			})

			test("a container-resolution crash logs the error line and exits 1", async () => {
				vi.mocked(container.resolve).mockImplementation(() => {
					throw new Error("no registration for token")
				})

				const exitCode = await run(["--dry-run"])

				expect(exitCode).toBe(1)
				expect(loggerSpies.error).toHaveBeenCalledTimes(1)
				const [, props] = loggerSpies.error.mock.calls[0] as [string, Record<string, unknown>]
				expect(props).toMatchObject({ errorMessage: "no registration for token", expiredCount: null, dryRun: true })
				expect(props["boundary"]).toBe(expectedBoundary(props))
			})
		})
	})
})
