---
status: accepted
---

# The per-endpoint write rate budgets stay alongside the Turnstile human gate

The two state-changing public POSTs — member file upload (`withPublicGuard("UPLOAD_WRITE", …)`) and renewal submission (`withPublicGuard("RENEWAL_SUBMIT", …)`) — are now gated twice: the Turnstile human gate (SEC-5, #129, transport per ADR-0028, wired client-side by SEC-6, #130) and the SEC-2 write budgets (SEC-2, #126). With the gate live on both routes, the budgets look redundant, and their original member-shaped numbers (10 uploads/10 min, 20 submissions/hour) were tuned before anyone measured a full Apidog regression run against them — a run in which every request drains ONE shared client-IP bucket. This ADR keeps the budgets as a separate control (they are not folded into the gate) and raises their caps (10→30 per 10 min, 20→60 per hour) so a regression run fits under a single bucket while an abusive client still hits the wall in minutes. Decided 2026-11-12.

## Why

### 1. Turnstile proves humanness, not rate
The gate answers one yes/no question per request — "did a human solve a challenge" — and says nothing about volume: a guest who legitimately passes can still loop the renewal dialog all hour, and every passing request is a real R2 write or a real review-queue row. The budgets bound that volume independently: 30 uploads per 10 minutes and 60 submissions per hour cap what even a verified client can push through one IP. The two controls also fail independently — the budget works with or without Turnstile env, widgets, or siteverify availability, so removing it would collapse "is this a person" and "how many times" into a single point of failure.

### 2. On dev with the test bypass enabled, these budgets are the only throttle on guest writes
ADR-0029's env-gated bypass (`CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN`, #138/#139) waves token-carrying guests past siteverify on any host where an operator sets it — and the deployed dev environment runs `NODE_ENV=production` (ADR-0029), so `withPublicGuard` is fully active there (only `next dev` short-circuits it). With the bypass on, a scripted guest need not solve any challenge: origin gate, renewal window, and these write budgets are what remain. Keeping the budgets is therefore not belt-and-suspenders in prod alone — on dev they are the load-bearing throttle.

### 3. The caps must fit the suite: one client-IP bucket, many requests
`withPublicGuard` keys every budget on the trusted client IP (`resolveTrustedClientIp`), and the Apidog runner makes all its calls from one egress IP — so the entire regression run shares a single `UPLOAD_WRITE` bucket and a single `RENEWAL_SUBMIT` bucket. Under the old caps, the guest happy paths plus re-runs could trip 429 mid-run and fail the suite on throttle, not on regressions (ADR-0029 deliberately keeps the bypass consuming budget like any request, so this pressure is real). 30/10 min and 60/hour leave headroom for full runs, retries, and follow-up spot checks, while a genuine flood still exhausts a bucket in minutes — the caps are loosened for the suite, not opened.

## Considered options

- **Keep the budgets, raise the caps (chosen).** Both controls stay independent; the suite fits; dev keeps a real throttle under the bypass.
- **Fold write throttling into Turnstile (drop the budgets).** One control fewer to reason about, but humanness is not rate (Why 1), and with the ADR-0029 bypass enabled the throttling would be simply off — an open write path on a public URL.
- **Keep the budgets at 10/20.** Zero diff, but every full regression run risks tripping its own shared bucket mid-run and reporting throttle noise as failure — the same class of breakage the bypass was created to remove.
- **Exempt bypass-token requests from the budgets.** Would let the suite run unlimited, but the bypass value is a long-lived secret: exempting it mints a rate-limit-free credential and overturns ADR-0029's explicit ruling that "the bypass consumes rate budgets like any request".

## Consequences

- `RATE_LIMIT_BUDGETS` carries `UPLOAD_WRITE: { limit: 30, windowMs: 600_000 }` and `RENEWAL_SUBMIT: { limit: 60, windowMs: 3_600_000 }`; `PUBLIC_READ` and `SESSION_PROBE` are unchanged. The budget-lock test asserts the new numbers so the next tune is a reviewable diff against this ADR.
- The suite's budget-exhaustion TCs loop over `RATE_LIMIT_BUDGETS[…].limit`, so they self-adjust to the raised caps and still prove the 429 + `Retry-After` shape.
- A single abusive client can still push at most 30 uploads/10 min and 60 submissions/hour per IP before 429 — abuse stays bounded without per-request human proof.
- Further tuning remains the ONE-table edit in `rate-limiter.service.ts` (spec #124): change a number, update the lock test, cite the next ADR.
