import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"

import { REGISTER_KEY } from "src/modules/di-tokens"
import { AppError } from "src/shared/core/errors/app-error"

/**
 * The ONE tunable budget table (spec #124, developer story 24): tighten or
 * loosen a number here after renewal-season feedback. Later hardening tickets
 * (SEC-2..7) append their own budgets to this object.
 */
export const RATE_LIMIT_BUDGETS = {
	PUBLIC_READ: { limit: 120, windowMs: 60_000 },
	SESSION_PROBE: { limit: 60, windowMs: 60_000 },
} as const

export type RateLimitBudgetName = keyof typeof RATE_LIMIT_BUDGETS

export type RateLimitAllowance = {
	readonly allowed: true
}

export class RateLimitExceededError extends AppError {
	constructor(
		message: string,
		public readonly retryAfterSeconds: number
	) {
		super(message, "RATE_LIMIT_EXCEEDED")
	}
}

type WindowState = {
	windowStartMs: number
	count: number
}

// Fixed-window counters keyed `${budgetName}:${clientKey}`. A boundary burst
// up to 2x the limit is the accepted tradeoff for O(1) bookkeeping; sliding
// windows can come later if a real abuse wave needs them. Bounded memory:
// admitting a NEW key past the cap prunes expired windows first, so unique-IP
// floods cannot grow the map without bound (single-container deployment).
const MAX_TRACKED_KEYS = 10_000

/**
 * In-memory per-client rate limiter behind `withPublicGuard` (SEC-1, spec
 * #124). Time comes from the injected WALL_CLOCK — no test sleeps.
 */
@injectable()
export class RateLimiterService {
	private readonly windows = new Map<string, WindowState>()

	constructor(@inject(REGISTER_KEY.WALL_CLOCK) private readonly wallClock: () => Date) {}

	check(budgetName: RateLimitBudgetName, clientKey: string): Result<RateLimitAllowance, RateLimitExceededError> {
		const budget = RATE_LIMIT_BUDGETS[budgetName]
		const nowMs = this.wallClock().getTime()
		const key = `${budgetName}:${clientKey}`
		const current = this.windows.get(key)
		if (current !== undefined && nowMs - current.windowStartMs < budget.windowMs) {
			current.count += 1
			if (current.count > budget.limit) {
				const remainingMs = current.windowStartMs + budget.windowMs - nowMs
				return err(new RateLimitExceededError("Too Many Requests", Math.max(1, Math.ceil(remainingMs / 1000))))
			}
			return ok({ allowed: true })
		}
		if (current === undefined && this.windows.size >= MAX_TRACKED_KEYS) {
			this.pruneExpiredWindows(nowMs)
		}
		this.windows.set(key, { windowStartMs: nowMs, count: 1 })
		return ok({ allowed: true })
	}

	private pruneExpiredWindows(nowMs: number): void {
		const maxWindowMs = Math.max(...Object.values(RATE_LIMIT_BUDGETS).map((budget) => budget.windowMs))
		for (const [key, state] of this.windows) {
			if (nowMs - state.windowStartMs >= maxWindowMs) {
				this.windows.delete(key)
			}
		}
	}
}
