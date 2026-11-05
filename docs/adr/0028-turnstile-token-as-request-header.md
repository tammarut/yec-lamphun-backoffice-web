---
status: accepted
---

# The SEC-5 Turnstile token travels in a `Yec-Turnstile-Token` request header, not the request body

The public renewal flow's human-verification token (SEC-5, spec #124) is a **credential** — the same family as the `session_id` cookie — not request data, so it never rides the JSON body or the multipart form: both guarded POSTs (`/api/v1/members/file/upload`, `/api/v1/membership/renewals`) read it from the `Yec-Turnstile-Token` request header, and a body-borne token is ignored (strict header-only; no fallback). This supersedes the original #123/#124 ruling ("multipart form field on the upload endpoint; JSON body field on the renewal endpoint"), reversed in the 2026-11-05 grilling session before SEC-6 built any client. This decision was made on the branch feat/sec-5-turnstile-backend (PR #136) after the body-transport implementation had already survived one scrutiny round.

## Why

### 1. Credential semantics keep the schemas pure
A body field forced the domain schemas to know about the verification machinery: the renewal schema carried a `turnstile_token` optional string (later `nullish()` after scrutiny MAJOR-1 showed JSON `null` from serialized-uninitialized form state dying as a 400 before the gate), and the upload route needed a `typeof` guard so a File named `turnstile_token` couldn't spoof the field. The header removes the entire class: `CreateRenewalSchema` is back to pure domain data (`member_ids`, `payment_slip`), the multipart body stays pure Member File fields, and the gate reads the token from the request itself — one extraction site (turnstile-gate.ts) for both routes.

### 2. `Yec-Turnstile-Token`, per RFC 6648
No `X-` prefix (deprecated for custom headers — `X-` names repeatedly became standards and stranded legacy code), no underscores (reverse proxies such as Nginx drop underscore headers), Hyphenated-Pascal-Case. The `Yec-` namespace follows the Stripe-Version pattern (org-prefixed, collision-proof against future standard headers) and — as the repo's first house-crafted request header — establishes the prefix for future custom headers (pagination cursors, idempotency keys). `cf-turnstile-response` (Cloudflare's canonical *form-field* name) was rejected as a header name: the `cf-` prefix on an inbound API reads like Cloudflare-the-proxy injected it, borrowing trust vocabulary from the edge vendor — the same instinct that gates `cf-connecting-ip` behind the CIDR check.

### 3. Timing made it cheap, and the costs are one-time
The switch landed while PR #136 was unmerged and SEC-6 (#130, the widget) unbuilt — zero clients existed to migrate. CORS is a non-issue: the app and its API are same-origin (Next.js serves both), so the custom header triggers no preflight for real users, and non-browser clients (Apidog, curl) face no CORS enforcement at all. Logged-credential risk is unchanged: headers and bodies are equally log-visible, and neither is the URL query string. The one standing cost is documentation: the Apidog spec documents the header param on both endpoints, and the supersession is recorded in amendment comments on #123/#124 and the #129 AC text.

## Considered options

- **`Yec-Turnstile-Token` header on both endpoints (chosen).** Credential semantics, uniform transport, one extraction site, pure schemas.
- **Body field on both endpoints (the original ruling).** Rejected after scrutiny round 1: schema/gate coupling (`nullish`), multipart `typeof` guard, two extraction paths that could drift.
- **Header with body fallback.** Rejected: the fallback resurrects everything the header exists to kill (schema coupling, drift); with zero deployed clients, strict costs nothing.
- **`cf-turnstile-response` / `x-turnstile-token` as the name.** Rejected: vendor trust prefix on a client-supplied header; `X-` deprecated per RFC 6648.

## Consequences

- SEC-6's widget integration sends `Yec-Turnstile-Token` on both calls (upload + submit) — no per-endpoint transport special-casing.
- The gate's 403 ("Human verification failed") covers header-missing the same as token-invalid; guests see one failure vocabulary (supplemented by the 503 "temporarily unavailable" server-side family).
- Apidog regression cases must set the header (no body field to fill); the 400-validation class for the token no longer exists — a token problem is always 403 or 503, never 400.
