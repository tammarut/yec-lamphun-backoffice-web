# Cloudflare Free-plan protection matrix (wayfinder research #120)

**Ticket:** [tammarut/yec-lamphun-backoffice-web#120 — Cloudflare Free-plan protection matrix](https://github.com/tammarut/yec-lamphun-backoffice-web/issues/120)
**As of:** 2026-11-01 (all facts checked against developers.cloudflare.com on this date)
**Scope:** What the Cloudflare **Free plan** can do, today, for protecting a public JSON API + a file-upload endpoint.

---

## 1. Rate limiting rules on Free

Source: [WAF rate limiting rules — availability](https://developers.cloudflare.com/waf/rate-limiting-rules/) (the "Availability" section is plan-per-plan).

| Aspect | Free plan value |
|---|---|
| Number of rules | **1 rate limiting rule per zone** (Pro: 2, Business: 5, Enterprise: 100) |
| Scope | **Per-zone.** Rules are zone-level products; only Enterprise customers can deploy account-level rate limiting rulesets across zones |
| Counting characteristic | **Source IP only** ("IP"). Custom counting keys (query, host, header, cookie, ASN, JA3/JA4, body, …) are Business/Enterprise. On Free the counter is always per-IP |
| Counting expression | **Not available on Free** (custom counting expression is Business+). The rule expression itself is the counting expression |
| Fields usable in the rule expression | **Free: `http.request.uri.path` (Path) and `cf.bot_management.verified_bot` (Verified Bot) only**. Host/URI/query fields are Pro+; method/user-agent are Business+ |
| Counting period | **10 seconds only** (supported periods go up to 86,400 s, but Free is capped at 10 s) |
| Mitigation timeout | **10 seconds** (Pro: up to 1 h; Business/Enterprise: up to 1 day) |
| Action when over limit | Block (perform action during the mitigation period). "Throttle" behavior is Enterprise-only |
| Cache exclusion | Not available on Free (Business+) |

Operational notes (same page): counters are **per data center** (not global) and "may take some time to propagate", so a burst of excess requests can still reach the origin — the origin must keep its own guard rails (session checks, per-user limits).

**Practical read for our API:** on Free you can express exactly one rule, shape like `http.request.uri.path eq "/api/..."` (optionally excluding verified bots), counting **per client IP** over **10 s**, blocking for **10 s**. That is a blunt anti-flood tool — not a per-endpoint quota system. With 1 rule per zone, the single expression must cover the whole API surface you want flood-protected.

---

## 2. WAF custom rules on Free

Sources: [WAF custom rules](https://developers.cloudflare.com/waf/custom-rules/) (availability table), [Ruleset Engine actions](https://developers.cloudflare.com/ruleset-engine/rules-language/actions/).

- **Number of rules:** **5 custom rules per zone** on Free (Pro: 20, Business: 100, Enterprise: 1,000). Counted across the `http_request_firewall_custom` phase. Free gets **1 zone custom ruleset** (Pro: 2, Business: 5); **account-level custom rulesets are Enterprise-only**.
- **Actions on Free:** the availability table marks Free as **"All except Log"**. In the Ruleset Engine the WAF actions are:
  - `block` (terminating; 403),
  - `managed_challenge` (terminating),
  - `challenge` — Interactive Challenge (terminating),
  - `js_challenge` — Non-interactive Challenge (terminating),
  - `skip` (non-terminating; skip remaining rules / selected products).
  - `log` is **Enterprise-only** (non-terminating).
- **Regex in rule expressions:** **not supported on Free/Pro** (Business+). Simple comparisons, `in` lists, `starts_with()`, etc. are available.
- Custom rules are evaluated **before** rate limiting rules in the WAF execution order, and a `skip` custom rule can exempt chosen traffic from remaining custom rules / rate limiting — one of the few composition tools available on Free.

**Practical read:** 5 rules is enough for a coarse API posture (e.g. block a region/ASN, challenge obvious junk paths, force HTTPS-on-API semantics), but each rule is a permanent, always-on decision — not a conditional experiment.

---

## 3. Bot Fight Mode

Source: [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/).

- Free product, toggled per zone: "identifies traffic matching patterns of known bots" and issues "computationally expensive" challenges to make automated requests costly. Requests it challenges appear in Security Events labeled "Bot Fight Mode".
- **It is a domain-wide toggle: no per-path scoping.** The docs state it "[p]rotects entire domains without endpoint restrictions" and, critically: **"You cannot bypass or skip Bot Fight Mode using WAF custom rules or Page Rules."** It does not run on the Ruleset Engine, so `Skip` / `Bypass` / `Allow` actions have no effect on it. (Confirmed in [WAF custom rules — interaction with Bot Fight Mode](https://developers.cloudflare.com/bots/additional-configurations/custom-rules/) and widely reported in community threads, e.g. [webhook blocking reports](https://community.cloudflare.com/t/bot-fight-mode-blocks-webhooks-from-ifttt-such-as-for-home-assistant/383528).)
- **What it blocks/challenges:** known bot patterns; the page does not guarantee a "definitely automated / likely automated" split on Free (that taxonomy belongs to paid Bot Management). Verified bots are generally not blocked (bot-score taxonomy lives under [Bot Management](https://developers.cloudflare.com/bots/)). **Known gap:** "may challenge API or mobile app traffic" — i.e. legitimate non-browser clients can get challenged with no allowlist mechanism on Free. Community threads document real false positives (webhooks, monitoring agents) that could not be exempted.
- **No configuration:** cannot be customized, adjusted, or reconfigured via WAF custom rules; the only control is on/off. JavaScript Detections are "automatically enabled and cannot be disabled" for Bot Fight Mode customers (CSP must allow `/cdn-cgi/challenge-platform/`).
- IP Access rules are evaluated first: "it will not trigger if an IP Access rule matches the request first."
- The paid counterpart, **Super Bot Fight Mode** (Pro+, with Skip rules on Business+), runs on the Ruleset Engine and supports Skip rules; Bot Fight Mode does not.

**Practical read:** enabling Bot Fight Mode in front of a public JSON API is risky precisely because it cannot be scoped off `/api/*` and its challenges are unsolvable for API clients. If the API must stay bot-challenge-free, leave Bot Fight Mode **off** for that zone (or accept un-exemptable challenges on machine traffic).

---

## 4. Turnstile

Sources: [Turnstile get started](https://developers.cloudflare.com/turnstile/get-started/), [Widget concepts](https://developers.cloudflare.com/turnstile/concepts/widget/), [Plans](https://developers.cloudflare.com/turnstile/plans/), [Server-side validation (siteverify)](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

### Widget modes

| Mode | Behavior | User sees |
|---|---|---|
| **Managed** (recommended) | "Automatically chooses between non-interactive or checkbox challenge based on visitor risk level." No CAPTCHA puzzles — "There will be no images or text to decipher." | Usually nothing; occasionally a checkbox |
| **Non-interactive** | "Displays visible widget with loading spinner. Runs challenges without requiring visitor interaction." | A visible spinner; never prompted to interact |
| **Invisible** | "Runs challenges completely in the background with no visible widget or loading indicators." | Nothing at all. Requires referencing Cloudflare's Turnstile Privacy Addendum in your privacy policy |

### Free-tier limits and pricing

- Free tier: **"Unlimited challenges (traffic or verification requests)"** — no per-request quota. **Up to 20 widgets per account**, **10 hostnames per widget**, all widget types, **pre-clearance support included**, 7-day analytics.
- Only other tier is Enterprise (contact sales): unlimited widgets, 200 hostnames/widget, ephemeral IDs, 30-day analytics.
- **Turnstile is account-independent of proxying:** "You can use Turnstile on any website, regardless of whether it is proxied through the Cloudflare network" (a Cloudflare account is required, but the zone does not have to be on Cloudflare's proxy). Free tier "suits most production applications" per Cloudflare.

### Siteverify API contract

- **Endpoint:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` — accepts `application/x-www-form-urlencoded` or `application/json`; **always returns JSON**.
- **Request params:** `secret` (required — the widget's secret key), `response` (required — the client token), `remoteip` (optional — visitor IP), `idempotency_key` (optional — UUID to safely retry validation).
- **Response shape:** `success` (boolean), `challenge_ts` (ISO 8601 solve timestamp), `hostname` (hostname the challenge was served on), `error-codes` (array, empty on success), `action` (client-side action identifier), `cdata` (client-side custom data), `metadata.ephemeral_id` (Enterprise only).
- **Error codes:** `missing-input-secret`, `invalid-input-secret`, `missing-input-response`, `invalid-input-response` (token invalid/malformed/expired — user should retry), `bad-request`, `timeout-or-duplicate` (already validated or expired), `internal-error` (retryable).

### Token lifetime and single use

- "Tokens expire after **300 seconds (5 minutes)**" after generation; maximum token length 2,048 chars.
- "**Each token can only be validated once.**" A replayed or expired token fails siteverify with `timeout-or-duplicate`; the client must obtain a fresh token (widget `turnstile.reset()`).
- So: server-side validation **is** the single-use gate — validate exactly once per request on the server (our Next.js API handler), immediately after the client presents the token. Server-side validation is mandatory ("You must call the Siteverify API to complete your Turnstile implementation").
- **Pre-clearance** (free): a Turnstile widget can issue a `cf_clearance` cookie that lets the browser pass Cloudflare-managed challenges for a period — useful for browser flows that then call the API, but it does nothing for non-browser clients.

**Practical read:** Turnstile is the only free, unlimited, per-request human-verification primitive in this stack, and it is exactly suited to hardening the public JSON API + upload endpoint at the application layer (frontend obtains token per submission → API validates once via siteverify, with `action`/`cdata` binding the token to the operation).

---

## 5. Request body size at the edge

Source: [Error 413 — Cloudflare support docs](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/).

- **Maximum upload (request body) size: Free = 100 MB** (Pro: 100 MB, Business: 200 MB, Enterprise: up to 5 GB, self-serve up to 5 GB). Confirms the expected 100 MB for Free.
- "Requests exceeding this limit receive a **`413 Request Entity Too Large`** error." The limit applies to any request proxied through Cloudflare.
- The **"Maximum Upload Size" zone setting** (Network page) is a **single zone-wide value**, not a per-path rule. Enterprise can raise it; the docs indicate it can also be set lower, but it remains zone-wide — there is **no per-path body-size cap at the edge**.
- A smaller per-path cap in WAF rules is **not possible on Free**: the rules-language field `http.request.body.size` ("The total size of the HTTP request body (in bytes)") is **Enterprise-only** ([Fields reference](https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/)); in fact all request-body inspection fields (`http.request.body.*`) are Enterprise. Workarounds on Free are only: split uploads into smaller requests, or use a DNS-only record (bypassing the proxy entirely).
- Note the interaction with Q1: the Free rate limiting rule's expression can only use Path and Verified Bot — it cannot match on body size or content type either.

**Practical read:** Free gives a 100 MB hard ceiling, zone-wide, with a 413 at the edge. Any **tighter, per-path** upload cap (e.g. 10 MB on `/api/members/import`) must be enforced in the application layer (our Next.js route handler / R2 orchestration), not at the edge.

---

## 6. Hostname semantics

Sources: [Accounts and zones](https://developers.cloudflare.com/fundamentals/concepts/accounts-and-zones/), [Subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/), [WAF custom rules](https://developers.cloudflare.com/waf/custom-rules/), [Configuration rules](https://developers.cloudflare.com/rules/configuration-rules/).

- A zone covers the domain added to Cloudflare and its proxied subdomains; "Zone-level services … only affect your website, application, or API for that zone and not other zones, even if they are contained within the same account." WAF custom rules "filter all incoming requests to a zone" — i.e. **zone-level security settings (WAF, rate limiting, Bot Fight Mode, DDoS) apply by default to every proxied hostname under the zone**, apex and subdomains alike.
- **Splitting a subdomain into its own zone (separate settings) is Enterprise-only** ("subdomain setup" availability: Free/Pro/Business = No). On Free there is no per-hostname isolation of security products — everything shares the one zone's settings, and per-hostname differentiation is done **inside rule expressions** (`http.host eq "api.example.com"`).
- Per-hostname/per-path **steering** that does exist on Free: **Configuration Rules** (available on Free, up to 10 rules) can change settings per request based on "URL path, hostname, or request header" — but the plan-gated settings (host header override, resolve override, DNS record by name) are higher-plan features, and none of them create a security boundary.
- Account-level WAF constructs (account-level custom rulesets) are Enterprise-only.

**Practical read:** one Free zone = one shared security perimeter. Rules for `api.example.com` and `app.example.com` live in the same 5-rule / 1-rate-limit budget, so expressions must carry the hostname/path discrimination explicitly.

---

## 7. Challenges vs API clients (curl / Postman / Apidog)

Sources: [How challenges work](https://developers.cloudflare.com/cloudflare-challenges/concepts/how-challenges-work/), [Challenge pages](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/), [Ruleset Engine actions](https://developers.cloudflare.com/ruleset-engine/rules-language/actions/).

- Challenge actions (`managed_challenge`, `challenge`, `js_challenge`) respond with a **full HTML interstitial page** that the browser must "render and solve" using JavaScript ("typically takes less than five seconds" for non-interactive). Challenges rely on "client-side signals (data gathered from the visitor's browser environment)".
- The docs call out the exact failure mode relevant to a JSON API: "This mechanism fails when the browser expects a **non-HTML response, such as an AJAX or XHR (fetch) request**." For plain HTTP clients (curl, Postman, Apidog, CI scripts) there is no browser to solve in: a `js_challenge` means "the client that made the request must pass a non-interactive Cloudflare challenge before proceeding" — an automated client cannot, so the request is **blocked** (an interactive/managed challenge likewise stalls forever or blocks). The client just receives HTML (not the JSON it asked for) until/unless the challenge is solved in a real browser from the same IP (solving from a different IP is invalid — "you may encounter a Challenge loop").
- **Consequence for a public JSON API:** any rule using Managed Challenge / JS Challenge / Interactive Challenge, and any enablement of Bot Fight Mode ("may challenge API or mobile app traffic"), will break non-browser clients with no allowlist on Free. The API-compatible Free actions are **`block`** and **rate limiting (block)**, plus application-layer **Turnstile** verification for the flows we want human-gated. Cloudflare's own escape hatch for browser apps that call APIs is **Turnstile pre-clearance** (cf_clearance cookie) — which only helps browser clients, not curl-style clients.

---

## Bottom line for the layering decision

1. **Edge (Free) is a coarse net:** 5 WAF custom rules (all actions except Log), 1 rate limiting rule (per-IP, 10 s window, 10 s block, path+verified-bot expression only), 100 MB zone-wide body cap with 413, optional-but-unguardable Bot Fight Mode. Nothing here is per-path-configurable beyond what the expression can see (path, host).
2. **Application layer must own the fine control:** per-endpoint quotas, per-path upload caps, API-key/auth semantics, and human verification (Turnstile: unlimited free verifications, single-use 300 s tokens, mandatory siteverify) — the edge cannot express these on Free.
3. **Never point a challenge action (or Bot Fight Mode) at the public JSON API** unless breakage of curl/Postman/Apidog is acceptable; use `block` + rate limiting at the edge and Turnstile in the app.

---

## Source URLs

- Rate limiting rules availability: https://developers.cloudflare.com/waf/rate-limiting-rules/
- Rate limiting best practices: https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/
- WAF custom rules (availability): https://developers.cloudflare.com/waf/custom-rules/
- Ruleset Engine actions: https://developers.cloudflare.com/ruleset-engine/rules-language/actions/
- Ruleset Engine fields reference (http.request.body.*): https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/
- Bot Fight Mode: https://developers.cloudflare.com/bots/get-started/bot-fight-mode/
- Bot Fight Mode vs custom rules: https://developers.cloudflare.com/bots/additional-configurations/custom-rules/
- Turnstile get started (token lifecycle): https://developers.cloudflare.com/turnstile/get-started/
- Turnstile widget modes: https://developers.cloudflare.com/turnstile/concepts/widget/
- Turnstile plans (free tier limits): https://developers.cloudflare.com/turnstile/plans/
- Turnstile siteverify contract: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Turnstile pre-clearance: https://developers.cloudflare.com/cloudflare-challenges/concepts/clearance/
- How challenges work: https://developers.cloudflare.com/cloudflare-challenges/concepts/how-challenges-work/
- Challenge pages (HTML interstitials): https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/
- Error 413 / maximum upload size: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/
- Accounts and zones: https://developers.cloudflare.com/fundamentals/concepts/accounts-and-zones/
- Subdomain setup (Enterprise-only): https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/
- Configuration rules (per-path/per-hostname steering): https://developers.cloudflare.com/rules/configuration-rules/
- Community corroboration (Bot Fight Mode cannot be exempted per path): https://community.cloudflare.com/t/bot-fight-mode-blocks-webhooks-from-ifttt-such-as-for-home-assistant/383528

*All plan-limit facts above were taken from developers.cloudflare.com pages fetched on 2026-11-01; where third-party sources (community threads, blogs) conflicted, the Cloudflare docs figure was used. Items explicitly marked "unverified" — none; every load-bearing number was confirmed on a docs page.*
