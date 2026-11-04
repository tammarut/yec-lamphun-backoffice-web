import { beforeEach, describe, expect, test } from "vitest"

import { LOGIN_LOCKOUT_DURATION_MS, LOGIN_LOCKOUT_MAX_FAILURES, LOGIN_LOCKOUT_WINDOW_MS, LoginLockoutService, MAX_TRACKED_LOCK_KEYS } from "./login-lockout.service"

const BASE_MS = 1_700_000_000_000

describe("LoginLockoutService", () => {
	let nowMs: number
	let lockout: LoginLockoutService

	beforeEach(() => {
		nowMs = BASE_MS
		lockout = new LoginLockoutService(() => new Date(nowMs))
	})

	function fail(clientKey: string): void {
		lockout.recordFailure(clientKey)
	}

	function isLocked(clientKey: string) {
		return lockout.checkLock(clientKey)
	}

	describe("ticket constants", () => {
		// The lockout numbers are ticket-AC numbers (SEC-3, #127): 5 failures
		// per 15 minutes locks the pair for 15 minutes. Locked here so a tune
		// is a deliberate, reviewable diff against the ticket.
		test("carries the SEC-3 lockout numbers verbatim", () => {
			expect(LOGIN_LOCKOUT_MAX_FAILURES).toBe(5)
			expect(LOGIN_LOCKOUT_WINDOW_MS).toBe(900_000)
			expect(LOGIN_LOCKOUT_DURATION_MS).toBe(900_000)
		})
	})

	describe("checkLock", () => {
		describe("Happy cases", () => {
			test("allows a pair with no recorded failures", () => {
				expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
			})

			test("allows a pair under the failure threshold within one window", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
					fail("203.0.113.9:admin")
				}
				expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
			})

			test("expires the lockout cleanly after the duration", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
					fail("203.0.113.9:admin")
				}
				nowMs += LOGIN_LOCKOUT_DURATION_MS
				expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
			})

			test("starts a fresh failure window after window expiry instead of locking", () => {
				// Arrange: a near-threshold streak, then the window dies out.
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
					fail("203.0.113.9:admin")
				}
				nowMs += LOGIN_LOCKOUT_WINDOW_MS

				// Act/Assert: the first failure in the new window is count 1 —
				// the pair must NOT carry the stale count into a lock.
				fail("203.0.113.9:admin")
				expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
			})

			test("counts failures spaced inside the window toward the threshold", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
					fail("203.0.113.9:admin")
					nowMs += 60_000
				}
				fail("203.0.113.9:admin")
				expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
			})
		})

		describe("Unhappy cases", () => {
			test("locks the pair at the threshold failure with a RATE_LIMIT_EXCEEDED error", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
					fail("203.0.113.9:admin")
				}
				const result = isLocked("203.0.113.9:admin")
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED")
					expect(result.error.message).toBe("Too Many Requests")
				}
			})

			test("reports Retry-After as the whole lockout when it trips in the same tick", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
					fail("203.0.113.9:admin")
				}
				const result = isLocked("203.0.113.9:admin")
				if (result.isErr()) {
					expect(result.error.retryAfterSeconds).toBe(900)
				}
			})

			test("reports Retry-After as the remaining lockout seconds mid-lock", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
					fail("203.0.113.9:admin")
				}
				nowMs += 300_000
				const result = isLocked("203.0.113.9:admin")
				if (result.isErr()) {
					expect(result.error.retryAfterSeconds).toBe(600)
				}
			})

			test("still rejects before the lock duration fully elapses", () => {
				for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
					fail("203.0.113.9:admin")
				}
				nowMs += LOGIN_LOCKOUT_DURATION_MS - 1
				expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
			})
		})
	})

	describe("pair keying", () => {
		test("same IP different usernames stay independent", () => {
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
				fail("203.0.113.9:admin")
			}
			expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
			expect(isLocked("203.0.113.9:root").isOk()).toBe(true)
		})

		test("same username different IPs stay independent", () => {
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
				fail("203.0.113.9:admin")
			}
			expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
			expect(isLocked("203.0.113.10:admin").isOk()).toBe(true)
		})
	})

	describe("reset", () => {
		test("clears the pair so a prior streak cannot lock it", () => {
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 2; i += 1) {
				fail("203.0.113.9:admin")
			}
			lockout.reset("203.0.113.9:admin")
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
				fail("203.0.113.9:admin")
			}
			expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
		})

		test("clearing one pair leaves a sibling pair's streak intact", () => {
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
				fail("203.0.113.9:admin")
				fail("203.0.113.9:root")
			}
			lockout.reset("203.0.113.9:admin")
			fail("203.0.113.9:root")
			expect(isLocked("203.0.113.9:root").isErr()).toBe(true)
			expect(isLocked("203.0.113.9:admin").isOk()).toBe(true)
		})
	})

	describe("key pruning", () => {
		test("prunes dead pairs when a new pair arrives past the tracking cap", () => {
			for (let i = 0; i < MAX_TRACKED_LOCK_KEYS; i += 1) {
				fail(`pair-${i}`)
			}
			// Advance past every failure window, then admit one more pair: the
			// dead pairs must be dropped instead of growing the map forever.
			nowMs += LOGIN_LOCKOUT_WINDOW_MS + 1
			fail("203.0.113.9:admin")
			expect(lockout.trackedKeyCount).toBeLessThanOrEqual(MAX_TRACKED_LOCK_KEYS)
		})

		// Falsifies the unbounded-growth hazard: a username-spraying flood must
		// never grow the map past the cap (frozen clock — pruning frees nothing,
		// eviction has to carry the bound).
		test("hard-caps tracked pairs under an active unique-pair flood with a frozen clock", () => {
			for (let i = 0; i < MAX_TRACKED_LOCK_KEYS + 500; i += 1) {
				fail(`flood-pair-${i}`)
				expect(lockout.trackedKeyCount).toBeLessThanOrEqual(MAX_TRACKED_LOCK_KEYS)
			}
		})

		test("still admits new pairs and keeps them working after eviction at the cap", () => {
			for (let i = 0; i < MAX_TRACKED_LOCK_KEYS + 1; i += 1) {
				fail(`flood-pair-${i}`)
			}
			// Admission #MAX_TRACKED_LOCK_KEYS+1 evicted the oldest tracked
			// pair (flood-pair-0); its streak must restart as a fresh window —
			// four more failures stay under the threshold.
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES - 1; i += 1) {
				fail("flood-pair-0")
			}
			expect(isLocked("flood-pair-0").isOk()).toBe(true)
		})

		test("a live lockout is never silently freed by prune/eviction bookkeeping", () => {
			// Arrange: pair A locks; pairs B.. fill the map to the cap.
			for (let i = 0; i < LOGIN_LOCKOUT_MAX_FAILURES; i += 1) {
				fail("203.0.113.9:admin")
			}
			expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
			for (let i = 0; i < MAX_TRACKED_LOCK_KEYS - 1; i += 1) {
				fail(`flood-pair-${i}`)
			}

			// Act: more flood pressure forces prune+eviction bookkeeping.
			fail("flood-pair-x")

			// Assert: the live lock SURVIVED.
			expect(isLocked("203.0.113.9:admin").isErr()).toBe(true)
		})
	})
})
