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
	// Write budgets (SEC-2, #126; caps raised per ADR-0030): the state-changing
	// public POSTs. Upload is 6-files-per-renewal-dialog traffic; renewal
	// submission is one dialog per hour at most for a legitimate member (group
	// submissions are ONE request). The caps deliberately leave headroom for
	// the Apidog regression runs — every suite request shares ONE client-IP
	// bucket — while still bounding abuse: with the env-gated Turnstile test
	// bypass enabled on dev (ADR-0029), these budgets can be the only throttle
	// left on guest writes there.
	UPLOAD_WRITE: { limit: 30, windowMs: 600_000 },
	RENEWAL_SUBMIT: { limit: 60, windowMs: 3_600_000 },
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
	// The owning budget's window size, carried per entry so the prune sweep
	// expires each key by ITS OWN budget — a 60s PUBLIC_READ key must not
	// linger for the 1h RENEWAL_SUBMIT window (scrutiny MAJOR-2, PR #133).
	windowMs: number
	count: number
}

// Fixed-window counters keyed `${budgetName}:${clientKey}`. A boundary burst
// up to 2x the limit is the accepted tradeoff for O(1) bookkeeping; sliding
// windows can come later if a real abuse wave needs them. Bounded memory:
// admitting a NEW key past the cap prunes expired windows, then — if the map
// is still full under an active flood — evicts the OLDEST tracked window, so
// unique-IP floods can never grow the map past the cap (scrutiny BLOCKER, PR
// #132; single-container deployment).
export const MAX_TRACKED_KEYS = 10_000

// The expired-window sweep is O(N); without a floor, every request past the
// cap would rescan the whole map (quadratic under flood). Once per interval
// is plenty for a hygiene pass — the hard cap is enforced by eviction, not
// by pruning.
const PRUNE_MIN_INTERVAL_MS = 10_000

/**
 * In-memory per-client rate limiter behind `withPublicGuard` (SEC-1, spec
 * #124). Time comes from the injected WALL_CLOCK — no test sleeps.
 */
@injectable()
export class RateLimiterService {
	private readonly windows = new Map<string, WindowState>()
	private lastPruneMs = 0

	constructor(@inject(REGISTER_KEY.WALL_CLOCK) private readonly wallClock: () => Date) {}

	/** Observable size of the tracking map — the memory-bound seam for tests/ops. */
	get trackedKeyCount(): number {
		return this.windows.size
	}

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
		if (current === undefined) {
			this.admitNewKey(nowMs)
		}
		this.windows.set(key, { windowStartMs: nowMs, windowMs: budget.windowMs, count: 1 })
		return ok({ allowed: true })
	}

	private admitNewKey(nowMs: number): void {
		if (this.windows.size < MAX_TRACKED_KEYS) {
			return
		}
		this.pruneExpiredWindows(nowMs)
		if (this.windows.size < MAX_TRACKED_KEYS) {
			return
		}
		// Still full after pruning — an active flood of unique keys. Evict the
		// OLDEST tracked window (Map preserves insertion order) to keep the map
		// hard-capped; that client's counter simply restarts.
		const oldest = this.windows.keys().next().value
		if (oldest !== undefined) {
			this.windows.delete(oldest)
		}
	}

	private pruneExpiredWindows(nowMs: number): void {
		if (nowMs - this.lastPruneMs < PRUNE_MIN_INTERVAL_MS) {
			return
		}
		this.lastPruneMs = nowMs
		for (const [key, state] of this.windows) {
			if (nowMs - state.windowStartMs >= state.windowMs) {
				this.windows.delete(key)
			}
		}
	}
}
