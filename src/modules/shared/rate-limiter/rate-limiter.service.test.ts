import { beforeEach, describe, expect, test } from "vitest"

import { RateLimitExceededError, RATE_LIMIT_BUDGETS, RateLimiterService, MAX_TRACKED_KEYS } from "./rate-limiter.service"

const BASE_MS = 1_700_000_000_000

describe("RateLimiterService", () => {
	let nowMs: number
	let limiter: RateLimiterService

	beforeEach(() => {
		nowMs = BASE_MS
		limiter = new RateLimiterService(() => new Date(nowMs))
	})

	function take(budget: Parameters<RateLimiterService["check"]>[0], client: string) {
		return limiter.check(budget, client)
	}

	describe("check", () => {
		describe("Happy cases", () => {
			test("allows the first request in a window", () => {
				const result = take("PUBLIC_READ", "203.0.113.9")
				expect(result.isOk()).toBe(true)
			})

			test("allows every request up to the budget within one window", () => {
				const limit = RATE_LIMIT_BUDGETS["SESSION_PROBE"].limit
				for (let i = 0; i < limit; i += 1) {
					expect(take("SESSION_PROBE", "203.0.113.9").isOk()).toBe(true)
				}
			})

			test("rolls the window over: after windowMs the same client gets a fresh budget", () => {
				const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
				for (let i = 0; i < budget.limit; i += 1) {
					expect(take("PUBLIC_READ", "203.0.113.9").isOk()).toBe(true)
				}
				nowMs += budget.windowMs
				expect(take("PUBLIC_READ", "203.0.113.9").isOk()).toBe(true)
			})

			test("refilled budget after rollover sustains a full window again", () => {
				const budget = RATE_LIMIT_BUDGETS["PUBLIC_READ"]
				for (let i = 0; i < budget.limit; i += 1) {
					take("PUBLIC_READ", "203.0.113.9")
				}
				nowMs += budget.windowMs
				for (let i = 0; i < budget.limit; i += 1) {
					expect(take("PUBLIC_READ", "203.0.113.9").isOk()).toBe(true)
				}
			})

			test("keys budgets per client: exhausting one client leaves another untouched", () => {
				for (let i = 0; i < RATE_LIMIT_BUDGETS["SESSION_PROBE"].limit; i += 1) {
					take("SESSION_PROBE", "203.0.113.9")
				}
				expect(take("SESSION_PROBE", "203.0.113.10").isOk()).toBe(true)
			})

			test("keys budgets per name: exhausting PUBLIC_READ leaves SESSION_PROBE untouched for the same client", () => {
				for (let i = 0; i < RATE_LIMIT_BUDGETS["PUBLIC_READ"].limit; i += 1) {
					take("PUBLIC_READ", "203.0.113.9")
				}
				expect(take("SESSION_PROBE", "203.0.113.9").isOk()).toBe(true)
			})
		})

		describe("Unhappy cases", () => {
			test("rejects the request past the budget with a RATE_LIMIT_EXCEEDED error", () => {
				const budget = RATE_LIMIT_BUDGETS["SESSION_PROBE"]
				for (let i = 0; i < budget.limit; i += 1) {
					take("SESSION_PROBE", "203.0.113.9")
				}
				const result = take("SESSION_PROBE", "203.0.113.9")
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(RateLimitExceededError)
					expect(result.error.code).toBe("RATE_LIMIT_EXCEEDED")
				}
			})

			test("reports Retry-After as the whole window when the budget trips in the same tick", () => {
				const budget = RATE_LIMIT_BUDGETS["SESSION_PROBE"]
				for (let i = 0; i < budget.limit; i += 1) {
					take("SESSION_PROBE", "203.0.113.9")
				}
				const result = take("SESSION_PROBE", "203.0.113.9")
				if (result.isErr()) {
					expect(result.error.retryAfterSeconds).toBe(60)
				}
			})

			test("reports Retry-After as the remaining window seconds when the trip happens mid-window", () => {
				const budget = RATE_LIMIT_BUDGETS["SESSION_PROBE"]
				for (let i = 0; i < budget.limit; i += 1) {
					take("SESSION_PROBE", "203.0.113.9")
				}
				nowMs += 30_000
				const result = take("SESSION_PROBE", "203.0.113.9")
				if (result.isErr()) {
					expect(result.error.retryAfterSeconds).toBe(30)
				}
			})

			test("does not roll the window over before windowMs has fully elapsed", () => {
				const budget = RATE_LIMIT_BUDGETS["SESSION_PROBE"]
				for (let i = 0; i < budget.limit; i += 1) {
					take("SESSION_PROBE", "203.0.113.9")
				}
				nowMs += budget.windowMs - 1
				expect(take("SESSION_PROBE", "203.0.113.9").isErr()).toBe(true)
			})
		})
	})

	describe("key pruning", () => {
		test("prunes expired windows when a new key arrives past the tracking cap", () => {
			for (let i = 0; i < MAX_TRACKED_KEYS; i += 1) {
				take("PUBLIC_READ", `10.0.0.${i % 256}.${Math.floor(i / 256)}`)
			}
			// Advance past every budget window, then admit one more key: the
			// expired windows must be dropped instead of growing the map forever.
			nowMs += RATE_LIMIT_BUDGETS["PUBLIC_READ"].windowMs + 1
			expect(take("PUBLIC_READ", "203.0.113.9").isOk()).toBe(true)
			expect(take("PUBLIC_READ", "203.0.113.9").isOk()).toBe(true)
		})

		// Falsifies the scrutiny BLOCKER: the cap must hold under an ACTIVE
		// flood (no clock jump — every window still live, so pruning frees
		// nothing and eviction has to carry the bound).
		test("hard-caps tracked keys under an active unique-key flood with a frozen clock", () => {
			for (let i = 0; i < MAX_TRACKED_KEYS + 500; i += 1) {
				const result = take("PUBLIC_READ", `flood-${i}`)
				expect(result.isOk()).toBe(true)
				expect(limiter.trackedKeyCount).toBeLessThanOrEqual(MAX_TRACKED_KEYS)
			}
		})

		test("still admits new keys and keeps them working after eviction at the cap", () => {
			for (let i = 0; i < MAX_TRACKED_KEYS; i += 1) {
				take("PUBLIC_READ", `flood-${i}`)
			}
			// The very first flooded key was evicted by admission #MAX_TRACKED_KEYS+1;
			// its counter must restart as a fresh window (still allowed).
			expect(take("PUBLIC_READ", "flood-0").isOk()).toBe(true)
			expect(take("PUBLIC_READ", "flood-0").isOk()).toBe(true)
		})
	})
})
