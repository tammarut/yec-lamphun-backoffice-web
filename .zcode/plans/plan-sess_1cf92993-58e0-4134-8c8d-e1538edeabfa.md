# Chart the Wayfinder Map: "Public API hardening"

## Context

The backoffice exposes 8+ unauthenticated API handlers (upload → R2, renewal writes, public PII reads, login) with **zero rate limiting, no Origin checks, no bot gating, and no Next.js middleware** — confirmed by codebase exploration. Abuse vectors: storage exhaustion via unlimited 7MB×6 uploads (orphans persist; no delete API), unbounded formData buffering (memory DoS), renewal-write spam with UI-only renewal-window/PDPA enforcement, brute-forceable login (`!==` compare, `auth.service.ts:35`), and direct-to-origin bypass (CD deliberately bypasses Cloudflare via `DOKPLOY_ORIGIN_IP`). Prod app domain doesn't exist yet; dev runs behind Cloudflare-proxied Free plan — this is pre-launch hardening.

**Destination**: an approved **Public API hardening spec** ready to feed `to-spec` → `to-tickets`. (Wayfinder = planning only; implementation is out of this map's scope.)

**Decisions already made in this session** (recorded on the map):
- Bot gate = **both layered**: Origin/Referer checks on all state-changing public routes + Turnstile on the public renewal flow.
- In scope beyond rate limiting: **login rate limiting** (+ timing-safe compare), **server-side renewal-window enforcement**.
- Out of scope (user-ruled): system-settings GET auth, payment_slip verification, orphaned-R2 cleanup (deferred), PII-exposure redesign, session-store redesign.

## Steps (all after approval, via `gh` CLI — GitHub Issues is the tracker)

### 1. Create the map issue
Title: "Public API hardening — wayfinder map", label `wayfinder:map` (create label if missing). Body per wayfinder template: Destination, Notes (house conventions: 429 rejections use canonical `{ error_message }` body; Apidog spec sync for every behavioral change; AGENTS.md DI/neverthrow/valibot laws; tests `bunx --bun vitest`, hook-test AAA), Decisions so far (the 3 rulings above), Not yet specified (fog: abuse observability/alerting; Traefik middleware specifics pending layering decision; Apidog 429-doc sweep; R2 deleteObject refactor — deferred with orphan cleanup), Out of scope (the user-ruled items above).

### 2. Create child tickets as sub-issues of the map
Each: `## Question` body + `wayfinder:<type>` label only (no `ready-for-agent` — these are decisions, not build slices).

1. **Confirm edge facts for the dev zone** — `wayfinder:task` (HITL checklist for user): which Cloudflare zone hosts the dev app hostname, Turnstile availability in the account, rate-limiting rule UI presence, whether prod will reuse the zone; record facts + prod go-live implications. Unblocked.
2. **Cloudflare Free-plan protection matrix** — `wayfinder:research` (AFK subagent): rate-limiting rules count/shape on Free, WAF custom rules count, Turnstile limits/pricing/verify API, Free 100MB upload cap, edge-vs-origin bypass semantics. Unblocked. Resolution captured on a throwaway `research/cloudflare-free-matrix` branch (pushed, no PR).
3. **Layering & client-IP trust strategy** — `wayfinder:grilling`: adopt which layers (L0 edge rules / L2 Traefik body cap / L3 app limiter), origin-lockdown vs accepted-risk given the CD origin-bypass (ADR-0025), client-IP derivation behind Cloudflare+Traefik (trust `CF-Connecting-IP` only from CF ranges, else peer address — neutralizes spoof-based limiter evasion). Blocked by 1 + 2.
4. **App-level protection package** — `wayfinder:grilling`: per-endpoint rate-limit numbers, `middleware.ts` vs per-route placement, 429 response shape, Origin/Referer check design, upload `Content-Length` pre-check (kill unbounded formData buffering), login rate limit + timing-safe compare, renewal-window enforcement mechanics (`open_membership_renewal` checked server-side in POST /membership/renewals). Blocked by 3.
5. **Turnstile integration design** — `wayfinder:grilling`: widget placement in the renewal dialog, token field in upload/renewal valibot schemas, server siteverify call, admin-bypass design for the backoffice member wizard that shares the upload endpoint (cf. the renewals cookie-fork pattern, ADR-0015), failure UX. Blocked by 3 (and 1 for the availability fact).

### 3. Wire blocking edges (second pass, real ids)
Native GitHub "blocked by" relationships via `gh api` where available; body cross-references as fallback. This sorts 1–2 into the frontier, 3 behind them, 4–5 behind 3.

### 4. Fire the research subagent for ticket 2
Spawn an agent that resolves the Cloudflare Free-plan matrix via the research skill, commits findings to `research/cloudflare-free-matrix`, pushes the branch, links it from the ticket. No PR, never merged.

### 5. Stop
Charting is one session's work — nothing here resolves a decision. Next sessions work the frontier one ticket at a time (claim → resolve per type → resolution comment → close → update map Decisions-so-far). When all tickets are closed, the destination is reached and `to-spec` → `to-tickets` take over.

## Critical files referenced (for ticket bodies, not modified now)
- `src/app/api/v1/members/file/upload/route.ts` (unbounded formData, extension-only check)
- `src/modules/members/member-file.service.ts:30-33` (orphan behavior, no-delete storage client)
- `src/app/api/v1/membership/renewals/route.ts:85-91` (cookie-fork), `src/app/api/v1/membership/renewals/schema.ts` (unverified payment_slip)
- `src/modules/auth/auth.service.ts:35` (login compare), `src/app/api/v1/system-settings/route.ts:27` (documented gap, out of scope)
- `docs/adr/0025` (origin-bypass facts), `docs/adr/0027` (scheduled-job pattern), `docs/adr/0015` (public-with-admin-bypass pattern)

## Verification
- `gh issue view <map>` shows label `wayfinder:map`, all sections filled; sub-issues listed as children.
- Each ticket shows exactly one `wayfinder:<type>` label and no `ready-for-agent`.
- Blocking edges visible in tracker UI; frontier = tickets 1 + 2 unclaimed.
- Research branch `research/cloudflare-free-matrix` exists on origin with findings file; ticket 2 links it.
- No code changes, no PRs, no implementation in this step.