---
status: accepted
---

# The Turnstile Human Gate accepts an env-scoped Test Bypass Token for API regression testing

The Apidog regression suite runs against the live dev deployment, where the Human Gate (SEC-5) is active — so every guest happy-path POST test (upload 200s, renewal submissions 201s) started failing with `403 "Human verification failed"` the day SEC-5 shipped: an API test runner cannot mint a widget token. The gate therefore gains a scoped exception: when `CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN` is set, a guest whose `Yec-Turnstile-Token` header **exactly equals** that operator-generated value passes the gate without a siteverify call (`turnstile-gate.ts`, compared with the house `timingSafeStringEqual`). Decided in the 2026-11-11 grilling session (issue #138) after SEC-7's spot-check pass demonstrated the breakage empirically.

## Why

### 1. The suite's job is the deployed contract, and the deployed contract now includes the gate
The regression suite exists to prove real flows end-to-end against the dev deployment — real DB writes, real R2 objects, real gates. Local vitest route tests (mocked `TurnstileService`) pin the gate's branch logic, but they cannot prove that a correctly-tokened guest request still traverses origin gate → budget → window → review queue on the running system. Shrinking the suite to admin-cookie and negative cases (the fallback option) would have silently ended that proof.

### 2. Fail-closed semantics survive untouched everywhere else
The bypass is exact-match only, sits AFTER the missing/whitespace fast-fail, and falls through to the real siteverify flow on any other value — so every negative path the suite tests (tokenless 403, junk-token 403, siteverify 503) behaves identically with the env set or unset. With the env empty (the default, and the permanent state of prod), the gate is byte-for-byte the SEC-5 behavior: the exception exists only where an operator deliberately turns it on. This is not fail-open — the #124 clause stands for "a broken verifier never waves a request through"; the bypass is a deliberate, secret-gated stand-in for a verified verdict, not an error path.

### 3. The value is a secret, not a flag
The mechanism (this ADR, the code) is public knowledge, but the VALUE is operator-generated (`Bun.randomUUIDv7()`) and handled like the TURNSTILE keys: Dokploy dev env + Apidog env vars only, never in issues/PRs/docs. Knowing the mechanism grants nothing. This is why the boolean variant ("accept Cloudflare's public dummy literal") was rejected: it would put the bypass value in Cloudflare's public documentation, one toggle away from a fully open gate with nothing else to steal.

## Considered options

- **Env-gated secret header value (chosen).** Guest coverage preserved, no prod surface change (env never set), negatives keep exercising the real siteverify flow.
- **Re-scope happy-path TCs to the admin session fork.** Zero code, but the suite loses guest 201/200 semantics on live-dev entirely (approval semantics diverge from the public path's), and the "regression suite proves the guest flow" premise dies quietly.
- **Boolean flag accepting Cloudflare's public dummy token literal.** No secret to manage, but the value is publicly documented — the gate is one env flip from off for the whole internet with nothing else to compromise.
- **Testing-key swap windows** (swap Dokploy's real secret for the always-pass dummy during runs). Real guest coverage, zero code — but while swapped, the gate is off for the entire internet on a public URL (prior ruling from the SEC-5 planning), plus manual toil every run.
- **Accept the shrink.** Retire the broken guest happy paths. Least work; loses end-to-end write coverage.

## Consequences

- The six guest happy-path Apidog TCs carry `Yec-Turnstile-Token: {{turnstile_bypass_token}}`; negative TCs stay tokenless/junk and keep proving the 403/503 paths.
- Any server booting with the env set logs one loud `Turnstile TEST BYPASS is active` warn at start, once per process, from `instrumentation.ts` — the true boot hook — before the DB check (visible even in a crash-looping boot). Unconditional on `NODE_ENV`: Next always runs `NODE_ENV=production` under `build`+`start`, so a production-only condition would be dead code on every deployed host while silencing a local dev server that carries the bypass (PR-review refinement, 2026-11-11 — the original warn lived in the gate and fired on first invocation). Dev-only remains a convention enforced by review, not by code — the deployed dev app runs `NODE_ENV=production`, so a code-level prod ban would break the bypass exactly where it is needed.
- The bypass consumes rate budgets like any request (the guard wraps the handler); suite budget-exhaustion TCs are unaffected.
- The renewal-window check sits after the gate and still applies to bypass-carrying guests: the renewals suite documents "window must be OPEN on dev" as a precondition and fails visibly (`403 "membership renewal is currently closed"`) if the operator closes it — a real signal, not suite noise.
