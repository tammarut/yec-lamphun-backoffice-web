import { beforeEach, describe, expect, test } from "vitest"

import { RateLimitExceededError, RATE_LIMIT_BUDGETS, RateLimiterService, MAX_TRACKED_KEYS } from "./rate-limiter.service"

const BASE_MS = 1_700_000_000_000

describe("RATE_LIMIT_BUDGETS", () => {
	// The write budgets are ticket-AC numbers (SEC-2, #126): upload 10/10 min,
	// renewal submission 20/hour. Locked here so a tune-after-renewal-season
	// edit is a deliberate, reviewable diff against the ticket.
	test("carries the SEC-2 write budgets verbatim", () => {
		expect(RATE_LIMIT_BUDGETS["UPLOAD_WRITE"]).toEqual({ limit: 10, windowMs: 600_000 })
		expect(RATE_LIMIT_BUDGETS["RENEWAL_SUBMIT"]).toEqual({ limit: 20, windowMs: 3_600_000 })
	})
})

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

		// Falsifies the scrutiny MAJOR-2 (PR #133): the global maxWindowMs sweep
		// freed nothing once the 1-hour renewal budget landed, so cap pressure
		// evicted the OLDEST — a LIVE long-window budget — instead of the
		// already-expired short-window key. Per-entry windows must free the
		// expired read key and keep the mid-window renewal budget intact.
		test("frees an expired short-window key at cap pressure and keeps a live long-window budget intact", () => {
			// Arrange: a renewal client spends its full 20/hour budget; a read key
			// goes stale right after.
			for (let i = 0; i < RATE_LIMIT_BUDGETS["RENEWAL_SUBMIT"].limit; i += 1) {
				expect(take("RENEWAL_SUBMIT", "10.8.8.8").isOk()).toBe(true)
			}
			expect(take("RENEWAL_SUBMIT", "10.8.8.8").isErr()).toBe(true)
			take("PUBLIC_READ", "10.9.9.9")

			// 61s later: the read key is expired, the renewal window is live.
			nowMs += RATE_LIMIT_BUDGETS["PUBLIC_READ"].windowMs + 1

			// Fill to exactly the cap so the LAST admission triggers one prune
			// sweep (the 10s throttle keeps it to one) — and no eviction.
			for (let i = 0; i < MAX_TRACKED_KEYS - 1; i += 1) {
				take("RENEWAL_SUBMIT", `flood-${i}`)
			}

			// Assert: the live renewal window SURVIVED — the client stays blocked.
			expect(take("RENEWAL_SUBMIT", "10.8.8.8").isErr()).toBe(true)
		})
	})
})
