import { err, ok, type Result } from "neverthrow"
import { inject, injectable } from "tsyringe"

import { REGISTER_KEY } from "src/modules/di-tokens"
import { RateLimitExceededError, type RateLimitAllowance } from "src/modules/shared/rate-limiter/rate-limiter.service"

// The lockout numbers are ticket-AC numbers (SEC-3, #127): 5 failed logins
// within 15 minutes lock the IP+username pair out for 15 minutes — even
// attempts carrying the correct password (checkLock gates BEFORE the
// credential compare in AuthService).
export const LOGIN_LOCKOUT_MAX_FAILURES = 5
export const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000

// Bounded memory, same model as the shared limiter (SEC-1): admitting a NEW
// pair past the cap prunes dead pairs, then evicts the OLDEST NON-LOCKED pair
// — a merely-streaking counter may restart, but a LIVE lockout must not be
// silently freed by username-spray flood pressure (that would let an attacker
// evict the admin pair's lock and keep guessing). Only when EVERY tracked pair
// is locked does eviction fall back to the oldest locked one.
export const MAX_TRACKED_LOCK_KEYS = 10_000

// The dead-pair sweep is O(N); throttle it like the limiter's prune so cap
// pressure can't turn every admission into a full scan.
const PRUNE_MIN_INTERVAL_MS = 10_000

type LockoutState = {
	// Fixed window anchored at the FIRST failure in the streak (the limiter's
	// fixed-window tradeoff, applied to failures instead of requests).
	windowStartMs: number
	failureCount: number
	lockedUntilMs: number | null
}

/**
 * The ONE place the `ip:username` pair-key format is built (SEC-3 review:
 * primitive obsession — callers must not hand-roll the join, or a second
 * variant would silently split the failure streaks). Username is the
 * SANITIZED form so junk-character padding lands on the same key.
 */
export function loginPairKey(ip: string | null, sanitizedUsername: string): string {
	return `${ip ?? "unknown"}:${sanitizedUsername}`
}

/**
 * In-memory failure-counting lockout for the admin login (SEC-3, spec #124).
 * Keys are `ip:username` PAIRS — throttling the pair, not the IP alone, keeps
 * NAT'd offices working while still stopping single-source credential
 * stuffing. Successful logins reset the pair (failures only are counted).
 * Time comes from the injected WALL_CLOCK — no test sleeps.
 */
@injectable()
export class LoginLockoutService {
	private readonly entries = new Map<string, LockoutState>()
	private lastPruneMs = 0

	constructor(@inject(REGISTER_KEY.WALL_CLOCK) private readonly wallClock: () => Date) {}

	/** Observable size of the tracking map — the memory-bound seam for tests/ops. */
	get trackedKeyCount(): number {
		return this.entries.size
	}

	/** Gate called BEFORE the credential compare — a locked pair rejects 429 even with correct credentials. */
	checkLock(clientKey: string): Result<RateLimitAllowance, RateLimitExceededError> {
		const entry = this.entries.get(clientKey)
		const lockedUntilMs = entry?.lockedUntilMs ?? null
		if (lockedUntilMs === null) {
			return ok({ allowed: true })
		}
		const nowMs = this.wallClock().getTime()
		if (nowMs < lockedUntilMs) {
			const remainingMs = lockedUntilMs - nowMs
			return err(new RateLimitExceededError("Too Many Requests", Math.max(1, Math.ceil(remainingMs / 1000))))
		}
		return ok({ allowed: true })
	}

	/** Count one credential-compare failure for the pair; the threshold failure arms the lockout. */
	recordFailure(clientKey: string): void {
		const nowMs = this.wallClock().getTime()
		const entry = this.entries.get(clientKey)
		if (entry === undefined || nowMs - entry.windowStartMs >= LOGIN_LOCKOUT_WINDOW_MS) {
			this.admitNewPair(nowMs)
			this.entries.set(clientKey, { windowStartMs: nowMs, failureCount: 1, lockedUntilMs: null })
			return
		}
		entry.failureCount += 1
		if (entry.failureCount >= LOGIN_LOCKOUT_MAX_FAILURES) {
			entry.lockedUntilMs = nowMs + LOGIN_LOCKOUT_DURATION_MS
		}
	}

	/** Clear the pair's streak — called on successful login so successes never count toward the threshold. */
	reset(clientKey: string): void {
		this.entries.delete(clientKey)
	}

	private admitNewPair(nowMs: number): void {
		if (this.entries.size < MAX_TRACKED_LOCK_KEYS) {
			return
		}
		this.pruneDeadPairs(nowMs)
		if (this.entries.size < MAX_TRACKED_LOCK_KEYS) {
			return
		}
		this.evictOldestUnlocked()
	}

	private pruneDeadPairs(nowMs: number): void {
		if (nowMs - this.lastPruneMs < PRUNE_MIN_INTERVAL_MS) {
			return
		}
		this.lastPruneMs = nowMs
		for (const [key, state] of this.entries) {
			// Dead = BOTH the failure window and the lockout are over. The
			// conjunction matters: a lockout armed mid-window outlives the
			// window it was armed in (lock end ≥ window end).
			const windowOver = nowMs - state.windowStartMs >= LOGIN_LOCKOUT_WINDOW_MS
			const lockOver = state.lockedUntilMs === null || nowMs >= state.lockedUntilMs
			if (windowOver && lockOver) {
				this.entries.delete(key)
			}
		}
	}

	private evictOldestUnlocked(): void {
		const nowMs = this.wallClock().getTime()
		let oldestLocked: string | undefined
		for (const [key, state] of this.entries) {
			if (state.lockedUntilMs === null || nowMs >= state.lockedUntilMs) {
				this.entries.delete(key)
				return
			}
			if (oldestLocked === undefined) {
				oldestLocked = key
			}
		}
		// Every tracked pair is locked — the hard cap wins over lock survival.
		if (oldestLocked !== undefined) {
			this.entries.delete(oldestLocked)
		}
	}
}
